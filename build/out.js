(() => {
  // node_modules/.pnpm/@ffmpeg+ffmpeg@0.12.10/node_modules/@ffmpeg/ffmpeg/dist/esm/const.js
  var CORE_VERSION = "0.12.6";
  var CORE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`;
  var FFMessageType;
  (function(FFMessageType2) {
    FFMessageType2["LOAD"] = "LOAD";
    FFMessageType2["EXEC"] = "EXEC";
    FFMessageType2["WRITE_FILE"] = "WRITE_FILE";
    FFMessageType2["READ_FILE"] = "READ_FILE";
    FFMessageType2["DELETE_FILE"] = "DELETE_FILE";
    FFMessageType2["RENAME"] = "RENAME";
    FFMessageType2["CREATE_DIR"] = "CREATE_DIR";
    FFMessageType2["LIST_DIR"] = "LIST_DIR";
    FFMessageType2["DELETE_DIR"] = "DELETE_DIR";
    FFMessageType2["ERROR"] = "ERROR";
    FFMessageType2["DOWNLOAD"] = "DOWNLOAD";
    FFMessageType2["PROGRESS"] = "PROGRESS";
    FFMessageType2["LOG"] = "LOG";
    FFMessageType2["MOUNT"] = "MOUNT";
    FFMessageType2["UNMOUNT"] = "UNMOUNT";
  })(FFMessageType || (FFMessageType = {}));

  // node_modules/.pnpm/@ffmpeg+ffmpeg@0.12.10/node_modules/@ffmpeg/ffmpeg/dist/esm/utils.js
  var getMessageID = /* @__PURE__ */ (() => {
    let messageID = 0;
    return () => messageID++;
  })();

  // node_modules/.pnpm/@ffmpeg+ffmpeg@0.12.10/node_modules/@ffmpeg/ffmpeg/dist/esm/errors.js
  var ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
  var ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
  var ERROR_TERMINATED = new Error("called FFmpeg.terminate()");
  var ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

  // node_modules/.pnpm/@ffmpeg+ffmpeg@0.12.10/node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js
  var import_meta = {};
  var FFmpeg = class {
    #worker = null;
    /**
     * #resolves and #rejects tracks Promise resolves and rejects to
     * be called when we receive message from web worker.
     */
    #resolves = {};
    #rejects = {};
    #logEventCallbacks = [];
    #progressEventCallbacks = [];
    loaded = false;
    /**
     * register worker message event handlers.
     */
    #registerHandlers = () => {
      if (this.#worker) {
        this.#worker.onmessage = ({ data: { id, type, data } }) => {
          switch (type) {
            case FFMessageType.LOAD:
              this.loaded = true;
              this.#resolves[id](data);
              break;
            case FFMessageType.MOUNT:
            case FFMessageType.UNMOUNT:
            case FFMessageType.EXEC:
            case FFMessageType.WRITE_FILE:
            case FFMessageType.READ_FILE:
            case FFMessageType.DELETE_FILE:
            case FFMessageType.RENAME:
            case FFMessageType.CREATE_DIR:
            case FFMessageType.LIST_DIR:
            case FFMessageType.DELETE_DIR:
              this.#resolves[id](data);
              break;
            case FFMessageType.LOG:
              this.#logEventCallbacks.forEach((f2) => f2(data));
              break;
            case FFMessageType.PROGRESS:
              this.#progressEventCallbacks.forEach((f2) => f2(data));
              break;
            case FFMessageType.ERROR:
              this.#rejects[id](data);
              break;
          }
          delete this.#resolves[id];
          delete this.#rejects[id];
        };
      }
    };
    /**
     * Generic function to send messages to web worker.
     */
    #send = ({ type, data }, trans = [], signal) => {
      if (!this.#worker) {
        return Promise.reject(ERROR_NOT_LOADED);
      }
      return new Promise((resolve, reject) => {
        const id = getMessageID();
        this.#worker && this.#worker.postMessage({ id, type, data }, trans);
        this.#resolves[id] = resolve;
        this.#rejects[id] = reject;
        signal?.addEventListener("abort", () => {
          reject(new DOMException(`Message # ${id} was aborted`, "AbortError"));
        }, { once: true });
      });
    };
    on(event, callback) {
      if (event === "log") {
        this.#logEventCallbacks.push(callback);
      } else if (event === "progress") {
        this.#progressEventCallbacks.push(callback);
      }
    }
    off(event, callback) {
      if (event === "log") {
        this.#logEventCallbacks = this.#logEventCallbacks.filter((f2) => f2 !== callback);
      } else if (event === "progress") {
        this.#progressEventCallbacks = this.#progressEventCallbacks.filter((f2) => f2 !== callback);
      }
    }
    /**
     * Loads ffmpeg-core inside web worker. It is required to call this method first
     * as it initializes WebAssembly and other essential variables.
     *
     * @category FFmpeg
     * @returns `true` if ffmpeg core is loaded for the first time.
     */
    load = ({ classWorkerURL, ...config } = {}, { signal } = {}) => {
      if (!this.#worker) {
        this.#worker = classWorkerURL ? new Worker(new URL(classWorkerURL, import_meta.url), {
          type: "module"
        }) : (
          // We need to duplicated the code here to enable webpack
          // to bundle worekr.js here.
          new Worker(new URL("./worker.js", import_meta.url), {
            type: "module"
          })
        );
        this.#registerHandlers();
      }
      return this.#send({
        type: FFMessageType.LOAD,
        data: config
      }, void 0, signal);
    };
    /**
     * Execute ffmpeg command.
     *
     * @remarks
     * To avoid common I/O issues, ["-nostdin", "-y"] are prepended to the args
     * by default.
     *
     * @example
     * ```ts
     * const ffmpeg = new FFmpeg();
     * await ffmpeg.load();
     * await ffmpeg.writeFile("video.avi", ...);
     * // ffmpeg -i video.avi video.mp4
     * await ffmpeg.exec(["-i", "video.avi", "video.mp4"]);
     * const data = ffmpeg.readFile("video.mp4");
     * ```
     *
     * @returns `0` if no error, `!= 0` if timeout (1) or error.
     * @category FFmpeg
     */
    exec = (args, timeout = -1, { signal } = {}) => this.#send({
      type: FFMessageType.EXEC,
      data: { args, timeout }
    }, void 0, signal);
    /**
     * Terminate all ongoing API calls and terminate web worker.
     * `FFmpeg.load()` must be called again before calling any other APIs.
     *
     * @category FFmpeg
     */
    terminate = () => {
      const ids = Object.keys(this.#rejects);
      for (const id of ids) {
        this.#rejects[id](ERROR_TERMINATED);
        delete this.#rejects[id];
        delete this.#resolves[id];
      }
      if (this.#worker) {
        this.#worker.terminate();
        this.#worker = null;
        this.loaded = false;
      }
    };
    /**
     * Write data to ffmpeg.wasm.
     *
     * @example
     * ```ts
     * const ffmpeg = new FFmpeg();
     * await ffmpeg.load();
     * await ffmpeg.writeFile("video.avi", await fetchFile("../video.avi"));
     * await ffmpeg.writeFile("text.txt", "hello world");
     * ```
     *
     * @category File System
     */
    writeFile = (path, data, { signal } = {}) => {
      const trans = [];
      if (data instanceof Uint8Array) {
        trans.push(data.buffer);
      }
      return this.#send({
        type: FFMessageType.WRITE_FILE,
        data: { path, data }
      }, trans, signal);
    };
    mount = (fsType, options, mountPoint) => {
      const trans = [];
      return this.#send({
        type: FFMessageType.MOUNT,
        data: { fsType, options, mountPoint }
      }, trans);
    };
    unmount = (mountPoint) => {
      const trans = [];
      return this.#send({
        type: FFMessageType.UNMOUNT,
        data: { mountPoint }
      }, trans);
    };
    /**
     * Read data from ffmpeg.wasm.
     *
     * @example
     * ```ts
     * const ffmpeg = new FFmpeg();
     * await ffmpeg.load();
     * const data = await ffmpeg.readFile("video.mp4");
     * ```
     *
     * @category File System
     */
    readFile = (path, encoding = "binary", { signal } = {}) => this.#send({
      type: FFMessageType.READ_FILE,
      data: { path, encoding }
    }, void 0, signal);
    /**
     * Delete a file.
     *
     * @category File System
     */
    deleteFile = (path, { signal } = {}) => this.#send({
      type: FFMessageType.DELETE_FILE,
      data: { path }
    }, void 0, signal);
    /**
     * Rename a file or directory.
     *
     * @category File System
     */
    rename = (oldPath, newPath, { signal } = {}) => this.#send({
      type: FFMessageType.RENAME,
      data: { oldPath, newPath }
    }, void 0, signal);
    /**
     * Create a directory.
     *
     * @category File System
     */
    createDir = (path, { signal } = {}) => this.#send({
      type: FFMessageType.CREATE_DIR,
      data: { path }
    }, void 0, signal);
    /**
     * List directory contents.
     *
     * @category File System
     */
    listDir = (path, { signal } = {}) => this.#send({
      type: FFMessageType.LIST_DIR,
      data: { path }
    }, void 0, signal);
    /**
     * Delete an empty directory.
     *
     * @category File System
     */
    deleteDir = (path, { signal } = {}) => this.#send({
      type: FFMessageType.DELETE_DIR,
      data: { path }
    }, void 0, signal);
  };

  // src/index.ts
  var f = new FFmpeg();
  f.console.log("blah");
})();
