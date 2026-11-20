import { contextBridge, ipcRenderer } from "electron";
import type { Action, ChatEvent, CrewApi } from "./actions";

const api: CrewApi = {
  run: (action: Action) => ipcRenderer.invoke("crew:action", action),
  subscribe(receive) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      update: ChatEvent | null,
    ) => receive(update);
    ipcRenderer.on("crew:update", listener);
    return () => ipcRenderer.off("crew:update", listener);
  },
};

contextBridge.exposeInMainWorld("crew", api);
