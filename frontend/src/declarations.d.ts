declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
