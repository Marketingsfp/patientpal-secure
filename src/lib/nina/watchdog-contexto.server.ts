import { AsyncLocalStorage } from "node:async_hooks";
import type { ControleWatchdogNina } from "./watchdog.server";

export const contextoWatchdog = new AsyncLocalStorage<ControleWatchdogNina>();
export const processamentoWatchdogAtual = () => contextoWatchdog.getStore();
