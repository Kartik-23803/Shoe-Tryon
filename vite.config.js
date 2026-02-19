export default {
  server: {
    host: '0.0.0.0',   // THIS is the important part
    port: 5173,
    strictPort: true,
    allowedHosts: 'all',
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  }
};


// export default {
//   server: {
//     host: true,
//     allowedHosts: ['all'],
//     headers: {
//       "Cross-Origin-Opener-Policy": "same-origin",
//       "Cross-Origin-Embedder-Policy": "require-corp"
//     }
//   }
// };