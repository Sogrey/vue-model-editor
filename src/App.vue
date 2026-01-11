<script setup lang="ts">
import ModelViewer from './components/ModelViewer.vue'
</script>

<template>
  <div id="app">
    <ModelViewer />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #0f0f0f;
  color: #e0e0e0;
  overflow: hidden;
}

#app {
  width: 100%;
  height: 100vh;
}
</style>
