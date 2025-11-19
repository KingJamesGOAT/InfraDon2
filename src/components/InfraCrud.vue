<script lang="ts">
import { defineComponent } from 'vue'
import PouchDB from 'pouchdb'
import PouchDBFind from 'pouchdb-find'

// Register the find plugin
PouchDB.plugin(PouchDBFind)

// Document Interface
type InfraDoc = {
  _id?: string
  _rev?: string
  name: string
  content: string
  category: string
  created_at: string
}

// Configuration
const REMOTE_DB_URL = 'http://steve:Goldy_2002_2002@127.0.0.1:5984/infra_53_0850'
const LOCAL_DB_NAME = 'infra_local_db'

export default defineComponent({
  name: 'InfraCrud',

  data() {
    return {
      localDB: null as null | PouchDB.Database<InfraDoc>,
      remoteDB: null as null | PouchDB.Database<InfraDoc>,

      syncHandler: null as null | PouchDB.Replication.Sync<InfraDoc>,

      isOffline: true,
      syncStatus: 'Offline',

      docs: [] as InfraDoc[],
      loading: false,
      error: '',
      searchQuery: '',

      form: {
        _id: '',
        _rev: '',
        name: '',
        content: '',
        category: 'General',
      } as InfraDoc,
      isEdit: false,
    }
  },

  methods: {
    // --- INITIALIZATION ---
    initDatabases() {
      this.localDB = new PouchDB<InfraDoc>(LOCAL_DB_NAME)
      this.remoteDB = new PouchDB<InfraDoc>(REMOTE_DB_URL)
      this.createIndex()
    },

    async createIndex() {
      if (!this.localDB) return
      try {
        await this.localDB.createIndex({ index: { fields: ['name'] } })
      } catch (err) {
        console.error('Index creation failed:', err)
      }
    },

    // --- CRUD & SEARCH ---
    async fetchData() {
      if (!this.localDB) return
      this.loading = true
      this.error = ''

      try {
        let resultDocs: InfraDoc[] = []

        if (this.searchQuery && this.searchQuery.length > 0) {
          const result = await this.localDB.find({
            selector: { name: { $regex: new RegExp(this.searchQuery, 'i') } },
          })
          resultDocs = result.docs as InfraDoc[]
        } else {
          const result = await this.localDB.allDocs({ include_docs: true, descending: true })
          resultDocs = result.rows.map((row) => row.doc as InfraDoc)
        }

        this.docs = resultDocs
      } catch (err) {
        this.error = 'Error fetching data: ' + (err as Error).message
      } finally {
        this.loading = false
      }
    },

    async createData() {
      if (!this.localDB) return
      try {
        const newDoc: InfraDoc = { ...this.form, created_at: new Date().toISOString() }
        await this.localDB.post(newDoc)
        this.resetForm()
        await this.fetchData()
      } catch (err) {
        this.error = 'Create error: ' + (err as Error).message
      }
    },

    async updateData() {
      if (!this.localDB || !this.form._id || !this.form._rev) return
      try {
        const originalDoc = this.docs.find((doc) => doc._id === this.form._id)
        const createdAt = originalDoc ? originalDoc.created_at : new Date().toISOString()
        const updatedDoc: InfraDoc = { ...this.form, created_at: createdAt }
        await this.localDB.put(updatedDoc)
        this.resetForm()
        await this.fetchData()
      } catch (err) {
        this.error = 'Update error: ' + (err as Error).message
      }
    },

    async deleteData(doc: InfraDoc) {
      if (!this.localDB || !doc._id || !doc._rev) return
      try {
        await this.localDB.remove(doc._id, doc._rev)
        await this.fetchData()
      } catch (err) {
        this.error = 'Delete error: ' + (err as Error).message
      }
    },

    // --- REPLICATION ---
    toggleSync() {
      if (this.isOffline) {
        this.startSync()
      } else {
        this.stopSync()
      }
    },

    startSync() {
      if (!this.localDB || !this.remoteDB) return

      this.isOffline = false
      this.syncStatus = 'Syncing...'

      this.syncHandler = PouchDB.sync(this.localDB, this.remoteDB, { live: true, retry: true })
        .on('change', () => {
          this.fetchData()
        })
        .on('paused', () => {
          this.syncStatus = 'Sync Active (Waiting)'
        })
        .on('active', () => {
          this.syncStatus = 'Syncing...'
        })
        .on('error', (err) => {
          this.syncStatus = 'Sync Error'
          this.error = 'Sync Error: ' + (err as Error).message
        })
    },

    stopSync() {
      if (this.syncHandler) {
        this.syncHandler.cancel()
        this.syncHandler = null
      }
      this.isOffline = true
      this.syncStatus = 'Offline'
    },

    // --- FACTORY ---
    async generateFakeData() {
      if (!this.localDB) return
      const fakeDocs: InfraDoc[] = []
      const categories = ['Work', 'Personal', 'Urgent', 'General']

      for (let i = 0; i < 5; i++) {
        fakeDocs.push({
          name: `Fake User ${Math.floor(Math.random() * 1000)}`,
          content: `Generated content for category: ${categories[i % 4]}`,
          category: categories[i % 4],
          created_at: new Date().toISOString(),
        })
      }

      try {
        await this.localDB.bulkDocs(fakeDocs)
        await this.fetchData()
      } catch (err) {
        this.error = 'Factory error: ' + (err as Error).message
      }
    },

    startEdit(doc: InfraDoc) {
      this.isEdit = true
      this.form = { ...doc }
    },
    resetForm() {
      this.isEdit = false
      this.form = { _id: '', _rev: '', name: '', content: '', category: 'General', created_at: '' }
    },
    async submitForm() {
      await (this.isEdit ? this.updateData() : this.createData())
    },
  },

  mounted() {
    this.initDatabases()
    this.fetchData()
  },

  unmounted() {
    if (this.syncHandler) {
      this.syncHandler.cancel()
    }
  },
})
</script>

<template>
  <div class="container">
    <header>
      <h1 class="page-title">Travaux Pratiques - CouchDB</h1>
      <div class="sync-controls">
        <div class="status-indicator">
          Status: <span :class="isOffline ? 'red' : 'green'">{{ syncStatus }}</span>
        </div>
        <button @click="toggleSync" class="btn" :class="isOffline ? 'btn-success' : 'btn-warning'">
          {{ isOffline ? 'Go Online (Start Sync)' : 'Go Offline (Stop Sync)' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="content-grid">
      <div class="column">
        <div class="card factory-card">
          <h3>Outils de Démonstration</h3>
          <button @click="generateFakeData" class="btn btn-secondary full-width">
            Créer 5 Documents de Démo
          </button>
        </div>

        <div class="card form-card">
          <h3>{{ isEdit ? 'Modifier Document' : 'Nouveau Document' }}</h3>
          <form @submit.prevent="submitForm">
            <div class="form-group">
              <label>Nom</label><input v-model="form.name" required placeholder="Nom du document" />
            </div>
            <div class="form-group">
              <label>Catégorie</label
              ><select v-model="form.category">
                <option>General</option>
                <option>Work</option>
                <option>Personal</option>
                <option>Urgent</option>
              </select>
            </div>
            <div class="form-group">
              <label>Contenu</label><textarea v-model="form.content" required rows="3"></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">
                {{ isEdit ? 'Enregistrer' : 'Créer' }}</button
              ><button type="button" v-if="isEdit" @click="resetForm" class="btn btn-text">
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="column">
        <div class="search-bar">
          <input
            v-model="searchQuery"
            @input="fetchData"
            placeholder="🔍 Recherche par Nom (utilise Index)..."
          />
        </div>
        <div class="doc-list">
          <div v-if="docs.length === 0 && !loading" class="empty-state">Aucun document trouvé.</div>
          <div v-for="doc in docs" :key="doc._id" class="doc-card">
            <div class="doc-header">
              <h4>{{ doc.name }}</h4>
              <span class="badge">{{ doc.category }}</span>
            </div>
            <p>{{ doc.content }}</p>
            <div class="doc-footer">
              <small>ID: {{ doc._id }}</small>
              <div class="actions">
                <button @click="startEdit(doc)" class="btn-icon">✏️</button
                ><button @click="deleteData(doc)" class="btn-icon delete">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}
.container {
  max-width: 1000px;
  margin: 0 auto;
  font-family: 'Inter', sans-serif;
  color: #2c3e50;
  padding: 20px;
}
.page-title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  color: #2c3e50;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  border-bottom: 2px solid #ecf0f1;
  padding-bottom: 20px;
}
.sync-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}
.status-indicator {
  font-size: 0.9rem;
  font-weight: 600;
}
.green {
  color: #27ae60;
}
.red {
  color: #c0392b;
}
.error-msg {
  background: #fbe6e6;
  color: #c0392b;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #f09b9b;
  font-weight: 500;
}
.content-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 30px;
}
.card {
  background: #f9f9f9;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
  border: 1px solid #eee;
}
.form-group {
  margin-bottom: 15px;
}
label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  font-size: 0.9rem;
  color: #7f8c8d;
}
input,
select,
textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
}
input:focus,
textarea:focus {
  outline: 2px solid #3498db;
  border-color: transparent;
}
.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.1s;
}
.btn-primary {
  background: #3498db;
  color: white;
}
.btn-primary:hover {
  background: #2980b9;
}
.btn-secondary {
  background: #95a5a6;
  color: white;
}
.btn-secondary:hover {
  background: #7f8c8d;
}
.btn-success {
  background: #2ecc71;
  color: white;
}
.btn-success:hover {
  background: #27ae60;
}
.btn-warning {
  background: #f39c12;
  color: white;
}
.btn-warning:hover {
  background: #e67e22;
}
.btn-text {
  background: none;
  color: #7f8c8d;
}
.full-width {
  width: 100%;
}
.search-bar {
  margin-bottom: 20px;
}
.search-bar input {
  width: 100%;
  padding: 12px;
  border: 2px solid #ddd;
  background: #f9f9f9;
}
.doc-card {
  background: white;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 15px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}
.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.doc-header h4 {
  margin: 0;
  font-size: 1.1rem;
}
.badge {
  background: #ecf0f1;
  color: #7f8c8d;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
}
.doc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  border-top: 1px solid #eee;
  padding-top: 10px;
}
.doc-footer small {
  color: #bdc3c7;
  font-size: 0.75rem;
}
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
}
</style>
