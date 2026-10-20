import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'mobile',base:'./',publicDir:false,plugins:[react()],build:{outDir:'../dist-mobile',emptyOutDir:true}});
