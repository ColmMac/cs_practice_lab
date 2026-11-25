// Merged with the `ImportMetaEnv` from `vite/client` (listed in tsconfig `types`).
interface ImportMetaEnv {
  readonly VITE_SITE_URL: string | undefined
  readonly VITE_ADSENSE_CLIENT: string | undefined
  readonly VITE_ADSENSE_SLOT: string | undefined
}
