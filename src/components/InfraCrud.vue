<script lang="ts">
import { defineComponent } from 'vue'
import PouchDB from 'pouchdb'
import PouchDBFind from 'pouchdb-find'

// Register plugins
PouchDB.plugin(PouchDBFind)

// --- INTERFACES ---
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

// Interface pour la 2ème collection (Logs)
type LogDoc = {
  _id?: string
  action: string
  date: string
  details: string
}

// --- CONFIGURATION ---
// Collection 1 : Messages (Déjà existante)
const REMOTE_DB_URL = 'http://steve:Goldy_2002_2002@127.0.0.1:5984/infra_53_0850'
const LOCAL_DB_NAME = 'infra_local_db'

// Collection 2 : Logs
const REMOTE_LOGS_URL = 'http://steve:Goldy_2002_2002@127.0.0.1:5984/infra_logs'
const LOCAL_LOGS_NAME = 'infra_logs_local'

export default defineComponent({
  name: 'InfraCrud',

  data() {
    return {
      // DB 1 : Messages
      localDB: null as null | PouchDB.Database<InfraDoc>,
      remoteDB: null as null | PouchDB.Database<InfraDoc>,

      // DB 2 : Logs (Nouvelle collection)
      logsLocalDB: null as null | PouchDB.Database<LogDoc>,
      logsRemoteDB: null as null | PouchDB.Database<LogDoc>,

      // Sync Handlers
      syncHandler: null as null | PouchDB.Replication.Sync<InfraDoc>,
      logsSyncHandler: null as null | PouchDB.Replication.Sync<LogDoc>,

      isOffline: true,
      syncStatus: 'Offline',

      // Data
      docs: [] as InfraDoc[],
      logs: [] as LogDoc[],

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
      // Init Collection 1 (Messages)
      this.localDB = new PouchDB<InfraDoc>(LOCAL_DB_NAME)
      this.remoteDB = new PouchDB<InfraDoc>(REMOTE_DB_URL)

      // Init Collection 2 (Logs)
      this.logsLocalDB = new PouchDB<LogDoc>(LOCAL_LOGS_NAME)
      this.logsRemoteDB = new PouchDB<LogDoc>(REMOTE_LOGS_URL)

      await this.createIndexes()
      await this.fetchData()
      await this.fetchLogs()
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

    // --- CRUD COLLECTION 1 (Messages) ---
    async fetchData() {
      if (!this.localDB) return
      this.loading = true
      try {
        let resultDocs: InfraDoc[] = []

        if (this.searchQuery && this.searchQuery.length > 0) {
          const result = await this.localDB.find({
            selector: { title: { $regex: new RegExp(this.searchQuery, 'i') } },
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

    // --- CRUD COLLECTION 2 (Logs) ---
    async fetchLogs() {
      if (!this.logsLocalDB) return
      try {
        const result = await this.logsLocalDB.allDocs({
          include_docs: true,
          descending: true,
          limit: 5,
        })
        this.logs = result.rows.map((row) => row.doc as LogDoc)
      } catch (err) {
        console.error('Erreur fetch logs', err)
      }
    },

    async addLog(action: string, details: string) {
      if (!this.logsLocalDB) return
      try {
        const newLog: LogDoc = {
          action,
          details,
          date: new Date().toLocaleString(),
        }
        await this.logsLocalDB.post(newLog)
        await this.fetchLogs()
      } catch (err) {
        console.error("Impossible d'ajouter le log", err)
      }
    },

    // --- ACTIONS PRINCIPALES ---
    async createData() {
      if (!this.localDB) return
      try {
        const newDoc: InfraDoc = {
          title: this.form.title,
          content: this.form.content,
          category: this.form.category,
          likes: 0,
          comments: [],
          created_at: new Date().toISOString(),
        }

        await this.localDB.post(newDoc)
        // Ajout dans la 2ème collection
        await this.addLog('Création', `Message "${newDoc.title}" créé`)

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
        const updatedDoc: InfraDoc = {
          ...this.form,
          created_at: originalDoc?.created_at || new Date().toISOString(),
          comments: originalDoc?.comments || [],
          likes: originalDoc?.likes || 0,
        }
        await this.localDB.put(updatedDoc)
        await this.addLog('Modification', `Message "${updatedDoc.title}" modifié`)

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
        // Ajout dans la 2ème collection
        await this.addLog('Suppression', `Message "${doc.title}" supprimé`)

        await this.fetchData()
      } catch (err) {
        this.error = 'Delete error: ' + (err as Error).message
      }
    },

    // --- SOCIAL & REPLICATION ---
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

    toggleSync() {
      // FIX: Use if/else instead of ternary operator to satisfy ESLint
      if (this.isOffline) {
        this.startSync()
      } else {
        this.stopSync()
      }
    },

    startSync() {
      if (!this.localDB || !this.remoteDB || !this.logsLocalDB || !this.logsRemoteDB) return
      this.isOffline = false
      this.syncStatus = 'Syncing...'

      // Sync Collection 1 (Messages)
      this.syncHandler = PouchDB.sync(this.localDB, this.remoteDB, { live: true, retry: true })
        .on('change', () => {
          this.fetchData()
        })
        .on('error', (err) => {
          this.error = 'Sync Msg Error: ' + (err as Error).message
        })

      // Sync Collection 2 (Logs)
      this.logsSyncHandler = PouchDB.sync(this.logsLocalDB, this.logsRemoteDB, {
        live: true,
        retry: true,
      })
        .on('change', () => {
          this.fetchLogs()
        })
        .on('error', (err) => {
          console.error('Sync Logs Error', err)
        })
    },

    stopSync() {
      if (this.syncHandler) {
        this.syncHandler.cancel()
        this.syncHandler = null
      }
      if (this.logsSyncHandler) {
        this.logsSyncHandler.cancel()
        this.logsSyncHandler = null
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
          title: `Sujet ${Math.floor(Math.random() * 1000)}`,
          content: `Contenu généré ${i}`,
          likes: Math.floor(Math.random() * 100),
          comments: [],
          category: categories[i % 4],
          created_at: new Date().toISOString(),
        })
      }
      try {
        await this.localDB.bulkDocs(fakeDocs)
        await this.addLog('Factory', '5 documents générés')
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
    if (this.syncHandler) this.syncHandler.cancel()
    if (this.logsSyncHandler) this.logsSyncHandler.cancel()
  },
})
</script>

<template>
  <div class="container">
    <header>
      <div class="header-left">
        <h1 class="page-title">InfraSync Messenger</h1>
        <div class="author-badge">
          <span class="author-name">Steve Benjamin</span>
          <span class="separator">|</span>
          <span class="class-name">M53-1</span>
        </div>
      </div>

      <div class="sync-controls">
        <div class="status-indicator">
          <span class="status-dot" :class="isOffline ? 'red' : 'green'"></span>
          <span>{{ syncStatus }}</span>
        </div>
        <button @click="toggleSync" class="btn" :class="isOffline ? 'btn-success' : 'btn-warning'">
          {{ isOffline ? 'Go Online' : 'Go Offline' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="content-grid">
      <div class="column left-column">
        <div class="card factory-card">
          <h3>🛠️ Outils</h3>
          <button @click="generateFakeData" class="btn btn-secondary full-width">
            Générer Données (Factory)
          </button>
        </div>

        <div class="card form-card">
          <h3>{{ isEdit ? '✏️ Modifier' : '➕ Nouveau Message' }}</h3>
          <form @submit.prevent="submitForm">
            <div class="form-group">
              <label>Titre</label>
              <input v-model="form.title" required placeholder="Sujet du message..." />
            </div>
            <div class="form-group">
              <label>Catégorie</label>
              <select v-model="form.category">
                <option>General</option>
                <option>Work</option>
                <option>Personal</option>
                <option>Urgent</option>
              </select>
            </div>
            <div class="form-group">
              <label>Contenu</label>
              <textarea
                v-model="form.content"
                required
                rows="4"
                placeholder="Votre message..."
              ></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary full-width">
                {{ isEdit ? 'Sauvegarder' : 'Publier' }}
              </button>
              <button
                type="button"
                v-if="isEdit"
                @click="resetForm"
                class="btn btn-text full-width"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>

        <div class="card logs-card">
          <h3>📜 Historique (Logs)</h3>
          <ul class="logs-list">
            <li v-for="log in logs" :key="log._id">
              <span class="log-date">{{ log.date.split(' ')[1] }}</span>
              <span class="log-details"
                ><strong>{{ log.action }}</strong> : {{ log.details }}</span
              >
            </li>
            <li v-if="logs.length === 0" class="empty-log">Aucun historique récent.</li>
          </ul>
        </div>
      </div>

      <div class="column right-column">
        <div class="filters-bar">
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input
              v-model="searchQuery"
              @input="fetchData"
              placeholder="Rechercher un message par titre..."
              class="search-input"
            />
          </div>
          <label class="sort-toggle">
            <input type="checkbox" v-model="sortByLikes" @change="fetchData" />
            <span class="toggle-label">Trier par Likes ❤️</span>
          </label>
        </div>

        <div class="doc-list">
          <div v-if="docs.length === 0 && !loading" class="empty-state">
            <p>Aucun message trouvé.</p>
          </div>

          <div v-for="doc in docs" :key="doc._id" class="doc-card">
            <div class="doc-header">
              <div class="title-group">
                <h4>{{ doc.title }}</h4>
                <span class="badge" :class="doc.category.toLowerCase()">{{ doc.category }}</span>
              </div>
              <div class="likes-container">
                <button @click="likeMessage(doc)" class="btn-like">❤️ {{ doc.likes }}</button>
              </div>
            </div>

            <div class="doc-body">
              <p>{{ doc.content }}</p>
            </div>

            <div class="comments-section">
              <h5>Commentaires ({{ doc.comments ? doc.comments.length : 0 }})</h5>
              <ul v-if="doc.comments && doc.comments.length > 0">
                <li v-for="(comment, idx) in doc.comments" :key="idx">
                  <span class="comment-text">{{ comment }}</span>
                  <span @click="deleteComment(doc, idx)" class="delete-x" title="Supprimer">×</span>
                </li>
              </ul>
              <div class="add-comment">
                <input
                  placeholder="Écrire un commentaire..."
                  @keyup.enter="
                    addComment(doc, ($event.target as HTMLInputElement).value)
                    ;($event.target as HTMLInputElement).value = ''
                  "
                />
              </div>
            </div>

            <div class="doc-footer">
              <span class="doc-id">ID: {{ doc._id?.slice(0, 8) }}...</span>
              <div class="actions">
                <button @click="startEdit(doc)" class="btn-icon" title="Modifier">✏️</button>
                <button @click="deleteData(doc)" class="btn-icon delete" title="Supprimer">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- DARK THEME MODERN CSS --- */
:root {
  --bg-color: #121212;
  --card-bg: #1e1e1e;
  --input-bg: #252525;
  --text-main: #e0e0e0;
  --text-muted: #a0a0a0;
  --border-color: #333333;
  --primary-color: #3a86ff; /* Bleu */
  --accent-color: #8338ec; /* Violet */
  --success-color: #06d6a0; /* Vert */
  --danger-color: #ef476f; /* Rouge */
  --warning-color: #ffbe0b; /* Jaune */
}

/* Global Layout */
.container {
  /* Use almost full width for laptop feeling */
  width: 96%;
  max-width: 1800px;
  margin: 0 auto;
  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  color: #e0e0e0;
  padding: 20px 0;
}

/* Header */
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
  padding: 20px 30px;
  background: #1e1e1e;
  border-radius: 16px;
  border: 1px solid #333;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.page-title {
  margin: 0;
  font-size: 2.2rem;
  font-weight: 800;
  background: linear-gradient(90deg, #3a86ff, #8338ec);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -1px;
}

.author-badge {
  margin-top: 5px;
  font-size: 0.95rem;
  color: #a0a0a0;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-name {
  color: #fff;
}
.separator {
  color: #3a86ff;
  font-weight: bold;
}
.class-name {
  background: #2c2c2c;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  border: 1px solid #444;
}

/* Controls */
.sync-controls {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #ccc;
  background: #252525;
  padding: 8px 16px;
  border-radius: 50px;
  border: 1px solid #333;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.green {
  background-color: #06d6a0;
  box-shadow: 0 0 8px rgba(6, 214, 160, 0.6);
}
.red {
  background-color: #ef476f;
}

/* Grid Layout - Sidebar Fixed, Content Liquid */
.content-grid {
  display: grid;
  /* Sidebar wider (400px), Right column takes all remaining space */
  grid-template-columns: 400px 1fr;
  gap: 30px;
}

@media (max-width: 1024px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
  .left-column {
    margin-bottom: 30px;
  }
}

/* Cards */
.card {
  background: #1e1e1e;
  padding: 25px;
  border-radius: 12px;
  border: 1px solid #333;
  margin-bottom: 25px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.card h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 1.1rem;
  color: #fff;
  border-bottom: 1px solid #333;
  padding-bottom: 15px;
}

/* Forms */
.form-group {
  margin-bottom: 18px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 0.8rem;
  color: #a0a0a0;
  text-transform: uppercase;
}

input,
select,
textarea {
  width: 100%;
  padding: 14px;
  background-color: #252525;
  border: 1px solid #444;
  border-radius: 8px;
  color: #fff;
  font-size: 0.95rem;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: #3a86ff;
  background-color: #2a2a2a;
}

/* Buttons */
.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: filter 0.2s;
}
.btn:hover {
  filter: brightness(1.1);
}

.btn-primary {
  background: #3a86ff;
  color: white;
}
.btn-secondary {
  background: #444;
  color: white;
}
.btn-success {
  background: #06d6a0;
  color: #000;
}
.btn-warning {
  background: #ffbe0b;
  color: #000;
}
.btn-text {
  background: transparent;
  color: #888;
  margin-top: 10px;
}
.btn-text:hover {
  color: #fff;
}
.full-width {
  width: 100%;
}

/* Logs */
.logs-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.logs-list li {
  font-size: 0.85rem;
  padding: 10px 0;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
}
.log-date {
  color: #555;
  font-family: monospace;
  min-width: 60px;
}
.log-details {
  color: #ccc;
  text-align: right;
}

/* Filter Bar */
.filters-bar {
  display: flex;
  gap: 20px;
  margin-bottom: 25px;
  align-items: stretch;
}

.search-wrapper {
  flex-grow: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 15px;
  font-size: 1.2rem;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 15px 15px 15px 45px; /* Padding left for icon */
  background-color: #1e1e1e;
  border: 1px solid #333;
  font-size: 1.1rem;
}

.sort-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  background: #1e1e1e;
  padding: 0 25px;
  border-radius: 8px;
  border: 1px solid #333;
  user-select: none;
  min-width: 180px;
  justify-content: center;
}

.toggle-label {
  font-weight: 600;
  font-size: 0.95rem;
}

/* Document Cards */
.doc-card {
  background: #1e1e1e;
  border-radius: 12px;
  border: 1px solid #333;
  padding: 25px;
  margin-bottom: 25px;
  transition: transform 0.2s;
  position: relative;
}

.doc-card:hover {
  transform: translateY(-3px);
  border-color: #555;
}

.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.title-group h4 {
  margin: 0 0 8px 0;
  font-size: 1.5rem;
  color: #fff;
}

.badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: bold;
  text-transform: uppercase;
  background: #333;
  color: #fff;
  display: inline-block;
}

/* Badge variants */
.badge.general {
  background: #4a4e69;
}
.badge.work {
  background: #3a86ff;
}
.badge.personal {
  background: #8338ec;
}
.badge.urgent {
  background: #ef476f;
}

.btn-like {
  background: #252525;
  color: #ff4d6d;
  border: 1px solid #ff4d6d;
  border-radius: 30px;
  padding: 6px 15px;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 700;
  transition: all 0.2s;
}
.btn-like:hover {
  background: #ff4d6d;
  color: #fff;
}

.doc-body p {
  color: #ccc;
  line-height: 1.7;
  font-size: 1.05rem;
  margin-bottom: 25px;
}

/* Comments */
.comments-section {
  background: #181818;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #333;
}

.comments-section h5 {
  margin: 0 0 15px 0;
  color: #777;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.comments-section ul {
  padding: 0;
  list-style: none;
  margin-bottom: 15px;
}
.comments-section li {
  background: #252525;
  margin-bottom: 8px;
  padding: 10px 15px;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.comment-text {
  color: #ddd;
  font-size: 0.9rem;
}
.delete-x {
  color: #666;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
}
.delete-x:hover {
  color: #ef476f;
}

.add-comment input {
  background: transparent;
  border: none;
  border-bottom: 1px solid #444;
  border-radius: 0;
  padding: 10px 0;
  color: #fff;
}
.add-comment input:focus {
  border-bottom-color: #3a86ff;
}

/* Footer */
.doc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 25px;
  padding-top: 15px;
  border-top: 1px solid #333;
}

.doc-id {
  color: #555;
  font-size: 0.8rem;
  font-family: monospace;
}

.actions {
  display: flex;
  gap: 10px;
}

.btn-icon {
  background: #252525;
  border: 1px solid #444;
  color: #fff;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all 0.2s;
}
.btn-icon:hover {
  border-color: #3a86ff;
  background: #3a86ff;
}
.btn-icon.delete:hover {
  border-color: #ef476f;
  background: #ef476f;
}

.error-msg {
  background: rgba(239, 71, 111, 0.15);
  color: #ef476f;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 30px;
  border: 1px solid rgba(239, 71, 111, 0.3);
  text-align: center;
  font-weight: bold;
}

.empty-state {
  text-align: center;
  padding: 60px;
  color: #555;
  font-style: italic;
  font-size: 1.1rem;
}
</style>
