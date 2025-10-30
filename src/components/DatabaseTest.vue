<script lang="ts">
import { defineComponent, ref } from 'vue'
import PouchDB from 'pouchdb'

// The polyfill that was here has been REMOVED.
//hello

// Define the type for documents in your database
interface CouchDoc {
  _id: string
  _rev?: string
  name: string
  project: string
  date: string
}

export default defineComponent({
  name: 'DatabaseTest',

  setup() {
    const docs = ref<CouchDoc[]>([]) // reactive array to store fetched documents
    const error = ref<string | null>(null)

    const initDatabase = async () => {
      try {
        const db = new PouchDB('http://steve:Goldy_2002_2002@localhost:5984/infra_53_0850')
        console.log('✅ Connected to CouchDB')

        const doc: CouchDoc = {
          _id: 'test_' + new Date().toISOString(),
          name: 'Steve',
          project: 'Vue + CouchDB integration test',
          date: new Date().toLocaleString(),
        }

        const response = await db.put(doc)
        console.log('Document saved:', response)

        const result = await db.get(response.id)
        console.log('📄 Retrieved document:', result)

        // Add to reactive array
        docs.value.push(result as CouchDoc)
      } catch (err) {
        console.error('Error during DB operation:', err)
        error.value = (err as Error).message
      }
    }

    // Automatically run when component mounts
    initDatabase()

    return { docs, error }
  },
})
</script>

<template>
  <div class="p-4">
    <h2>CouchDB + PouchDB Test</h2>
    <p>Open the console to see connection logs.</p>

    <div v-if="error" class="text-red-600">Error: {{ error }}</div>

    <ul v-else>
      <li v-for="doc in docs" :key="doc._id">
        {{ doc._id }} — {{ doc.name }} — {{ doc.project }} — {{ doc.date }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.p-4 {
  padding: 1rem;
}
.text-red-600 {
  color: #dc2626;
}
</style>
