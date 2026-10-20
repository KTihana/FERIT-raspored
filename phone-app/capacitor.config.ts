import type {CapacitorConfig} from '@capacitor/cli';
const config:CapacitorConfig={
 appId:'app.mojraspored.ferit',appName:'FERIT raspored',webDir:'dist-mobile',
 // No server.url: the interface ships inside the installed application.
 android:{allowMixedContent:false,backgroundColor:'#e9f5ff'},ios:{backgroundColor:'#e9f5ff'},
 // Capacitor refreshes these CSS insets for system bars and display cutouts on rotation.
 plugins:{SystemBars:{insetsHandling:'css',initialViewportFitValueHint:'cover'}},
};
export default config;
