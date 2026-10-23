// onnxruntime-web ships its types outside its package "exports", which the
// bundler module resolution cannot see; its API is that of onnxruntime-common.
declare module "onnxruntime-web" {
  export * from "onnxruntime-common";
}
