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
  title: string
  content: string
  likes: number
  comments: string[]
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

      // Sync handler typed correctly
      syncHandler: null as null | PouchDB.Replication.Sync<InfraDoc>,

      isOffline: true,
      syncStatus: 'Offline',

      docs: [] as InfraDoc[],
      loading: false,
      error: '',
      searchQuery: '',
      sortByLikes: false,

      form: {
        _id: '',
        _rev: '',
        title: '',
        content: '',
        likes: 0,
        comments: [],
        category: 'General',
        created_at: '',
      } as InfraDoc,
      isEdit: false,
    }
  },

  methods: {
    // --- INITIALIZATION ---
    async initDatabases() {
      this.localDB = new PouchDB<InfraDoc>(LOCAL_DB_NAME)
      this.remoteDB = new PouchDB<InfraDoc>(REMOTE_DB_URL)
      await this.createIndexes()
      await this.fetchData()
    },

    async createIndexes() {
      if (!this.localDB) return
      try {
        await this.localDB.createIndex({ index: { fields: ['title'] } })
        await this.localDB.createIndex({ index: { fields: ['likes'] } })
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
            selector: {
              title: { $regex: new RegExp(this.searchQuery, 'i') },
            },
            sort: this.sortByLikes ? [{ likes: 'desc' }] : undefined,
          })
          resultDocs = result.docs as InfraDoc[]
        } else if (this.sortByLikes) {
          const result = await this.localDB.find({
            selector: { likes: { $gte: 0 } },
            sort: [{ likes: 'desc' }],
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
        // FIX: Explicitly create the object to avoid "unused variable" errors
        const newDoc: InfraDoc = {
          title: this.form.title,
          content: this.form.content,
          category: this.form.category,
          likes: 0,
          comments: [],
          created_at: new Date().toISOString(),
        }

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
        const currentComments = originalDoc ? originalDoc.comments : []
        const currentLikes = originalDoc ? originalDoc.likes : 0

        const updatedDoc: InfraDoc = {
          ...this.form,
          created_at: createdAt,
          comments: currentComments,
          likes: currentLikes,
        }

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

    // --- SOCIAL FEATURES ---
    async likeMessage(doc: InfraDoc) {
      if (!this.localDB || !doc._id) return
      try {
        doc.likes = (doc.likes || 0) + 1
        await this.localDB.put(doc)
        await this.fetchData()
      } catch (err) {
        this.error = 'Like error: ' + (err as Error).message
      }
    },

    async addComment(doc: InfraDoc, commentText: string) {
      if (!this.localDB || !doc._id || !commentText.trim()) return
      try {
        if (!doc.comments) doc.comments = []
        doc.comments.push(commentText)
        await this.localDB.put(doc)
        await this.fetchData()
      } catch (err) {
        this.error = 'Add comment error: ' + (err as Error).message
      }
    },

    async deleteComment(doc: InfraDoc, index: number) {
      if (!this.localDB || !doc._id) return
      try {
        doc.comments.splice(index, 1)
        await this.localDB.put(doc)
        await this.fetchData()
      } catch (err) {
        this.error = 'Delete comment error: ' + (err as Error).message
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
        const likes = Math.floor(Math.random() * 100)
        fakeDocs.push({
          title: `Message Topic ${Math.floor(Math.random() * 1000)}`,
          content: `This is a discussion about topic number ${i}.`,
          likes: likes,
          comments: ['First!', 'Interesting...'],
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
      this.form = {
        _id: '',
        _rev: '',
        title: '',
        content: '',
        likes: 0,
        comments: [],
        category: 'General',
        created_at: '',
      }
    },

    async submitForm() {
      await (this.isEdit ? this.updateData() : this.createData())
    },
  },

  mounted() {
    this.initDatabases()
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
      <h1 class="page-title">Réseau Social (Session 8)</h1>
      <div class="sync-controls">
        <div class="status-indicator">
          Status: <span :class="isOffline ? 'red' : 'green'">{{ syncStatus }}</span>
        </div>
        <button @click="toggleSync" class="btn" :class="isOffline ? 'btn-success' : 'btn-warning'">
          {{ isOffline ? 'Go Online (Sync)' : 'Go Offline' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="content-grid">
      <div class="column">
        <div class="card factory-card">
          <h3>Outils</h3>
          <button @click="generateFakeData" class="btn btn-secondary full-width">
            Générer 5 Messages
          </button>
        </div>

        <div class="card form-card">
          <h3>{{ isEdit ? 'Modifier Message' : 'Nouveau Message' }}</h3>
          <form @submit.prevent="submitForm">
            <div class="form-group">
              <label>Titre</label
              ><input v-model="form.title" required placeholder="Sujet du message" />
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
                {{ isEdit ? 'Enregistrer' : 'Publier' }}</button
              ><button type="button" v-if="isEdit" @click="resetForm" class="btn btn-text">
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="column">
        <div class="filters-bar">
          <input
            v-model="searchQuery"
            @input="fetchData"
            placeholder="🔍 Rechercher par titre..."
            class="search-input"
          />
          <label class="sort-toggle">
            <input type="checkbox" v-model="sortByLikes" @change="fetchData" />
            Trier par Likes (Top)
          </label>
        </div>

        <div class="doc-list">
          <div v-if="docs.length === 0 && !loading" class="empty-state">Aucun message trouvé.</div>

          <div v-for="doc in docs" :key="doc._id" class="doc-card">
            <div class="doc-header">
              <h4>{{ doc.title }}</h4>
              <div class="likes-badge">
                ❤️ {{ doc.likes }}
                <button @click="likeMessage(doc)" class="btn-tiny">+1</button>
              </div>
            </div>

            <p class="doc-content">{{ doc.content }}</p>

            <div class="comments-section">
              <h5>Commentaires ({{ doc.comments ? doc.comments.length : 0 }})</h5>
              <ul>
                <li v-for="(comment, idx) in doc.comments" :key="idx">
                  {{ comment }}
                  <span @click="deleteComment(doc, idx)" class="delete-x">×</span>
                </li>
              </ul>
              <div class="add-comment">
                <input
                  placeholder="Ajouter un commentaire..."
                  @keyup.enter="
                    addComment(doc, ($event.target as HTMLInputElement).value)
                    ;($event.target as HTMLInputElement).value = ''
                  "
                />
              </div>
            </div>

            <div class="doc-footer">
              <small>ID: {{ doc._id }}</small>
              <div class="actions">
                <button @click="startEdit(doc)" class="btn-icon">✏️</button>
                <button @click="deleteData(doc)" class="btn-icon delete">🗑️</button>
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
.likes-badge {
  background: #fff0f0;
  color: #e74c3c;
  padding: 5px 10px;
  border-radius: 20px;
  font-weight: bold;
  border: 1px solid #fadbd8;
  display: flex;
  align-items: center;
  gap: 5px;
}
.btn-tiny {
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}
.btn-tiny:hover {
  background: #c0392b;
}
.comments-section {
  background: #f8f9fa;
  padding: 10px;
  border-radius: 6px;
  margin-top: 15px;
  font-size: 0.9rem;
}
.comments-section h5 {
  margin: 0 0 10px 0;
  color: #7f8c8d;
}
.comments-section ul {
  padding-left: 20px;
  margin: 0 0 10px 0;
}
.delete-x {
  color: #e74c3c;
  cursor: pointer;
  margin-left: 5px;
  font-weight: bold;
  font-size: 1.1rem;
}
.delete-x:hover {
  color: #c0392b;
}
.add-comment input {
  padding: 5px;
  font-size: 0.9rem;
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
}
</style>
