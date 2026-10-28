// pdfjs-dist ships this worker entry without declarations. Only this public
// worker export is used by the bundled fake-worker transport.
declare module 'pdfjs-dist/build/pdf.worker.mjs' {
 export const WorkerMessageHandler:{setup(handler:unknown,port:unknown):void};
}
