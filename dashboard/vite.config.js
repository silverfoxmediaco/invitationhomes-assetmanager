import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return {
        plugins: [react()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
        server: {
            port: 8080,
        },
        define: {
            "process.env.NODE_ENV": JSON.stringify(mode),
        },
    };
});
