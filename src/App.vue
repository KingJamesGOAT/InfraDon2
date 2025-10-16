<script setup lang="ts">
// Import the DatabaseTest component.
import DatabaseTest from './components/DatabaseTest.vue'
</script>

<template>
  <!-- The main container for the application content. -->
  <main>
    <!-- Render the DatabaseTest component here. -->
    <DatabaseTest />
  </main>
</template>

<style scoped>
/* Scoped styles apply only to this component. */
main {
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Oxygen,
    Ubuntu,
    Cantarell,
    'Fira Sans',
    'Droid Sans',
    'Helvetica Neue',
    sans-serif;
  padding: 2rem;
  color: #e2e8f0; /* Light text color for dark backgrounds */
}
</style>
