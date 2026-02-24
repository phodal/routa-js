declare module 'js-yaml' {
  export function load<T = any>(str: string | Buffer): T;
  export function safeLoad<T = any>(str: string | Buffer): T;
  export function dump(obj: any): string;
  const _default: {
    load: typeof load;
    safeLoad: typeof safeLoad;
    dump: typeof dump;
  };
  export default _default;
}
