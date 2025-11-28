<script lang="ts">
import { defineComponent } from 'vue'
import PouchDB from 'pouchdb'
import PouchDBFind from 'pouchdb-find'

// Enregistrement du plugin de recherche
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

type LogDoc = {
  _id?: string
  action: string
  date: string
  details: string
}

// --- CONFIGURATION ---
const REMOTE_DB_URL = 'http://steve:Goldy_2002_2002@127.0.0.1:5984/infra_53_0850'
const LOCAL_DB_NAME = 'infra_local_db'
const REMOTE_LOGS_URL = 'http://steve:Goldy_2002_2002@127.0.0.1:5984/infra_logs'
const LOCAL_LOGS_NAME = 'infra_logs_local'

export default defineComponent({
  name: 'InfraCrud',

  data() {
    return {
      localDB: null as null | PouchDB.Database<InfraDoc>,
      remoteDB: null as null | PouchDB.Database<InfraDoc>,
      logsLocalDB: null as null | PouchDB.Database<LogDoc>,
      logsRemoteDB: null as null | PouchDB.Database<LogDoc>,
      syncHandler: null as null | PouchDB.Replication.Sync<InfraDoc>,
      logsSyncHandler: null as null | PouchDB.Replication.Sync<LogDoc>,

      isOffline: true,
      syncStatus: 'Déconnecté',

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
        category: 'Général',
        created_at: '',
      } as InfraDoc,
      isEdit: false,
    }
  },

  methods: {
    async initDatabases() {
      this.localDB = new PouchDB<InfraDoc>(LOCAL_DB_NAME)
      this.remoteDB = new PouchDB<InfraDoc>(REMOTE_DB_URL)
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
        console.error('Erreur création index:', err)
      }
    },

    async fetchData() {
      if (!this.localDB) return
      this.loading = true
      this.error = ''

      try {
        let resultDocs: InfraDoc[] = []

        if (this.searchQuery && this.searchQuery.trim().length > 0) {
          const result = await this.localDB.find({
            selector: {
              title: { $regex: new RegExp(this.searchQuery, 'i') },
            },
          })
          resultDocs = result.docs as InfraDoc[]

          if (this.sortByLikes) {
            resultDocs.sort((a, b) => (b.likes || 0) - (a.likes || 0))
          }
        } else if (this.sortByLikes) {
          const result = await this.localDB.find({
            selector: { likes: { $gte: 0 } },
            sort: [{ likes: 'desc' }],
          })
          resultDocs = result.docs as InfraDoc[]
        } else {
          const result = await this.localDB.allDocs({ include_docs: true })
          resultDocs = result.rows
            .map((row) => row.doc as InfraDoc)
            .filter((doc) => !doc._id?.startsWith('_design'))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        }

        this.docs = resultDocs
      } catch (err) {
        this.error = 'Erreur lors du chargement : ' + (err as Error).message
        console.error(err)
      } finally {
        this.loading = false
      }
    },

    async fetchLogs() {
      if (!this.logsLocalDB) return
      try {
        const result = await this.logsLocalDB.allDocs({
          include_docs: true,
          descending: true,
          limit: 10,
        })
        this.logs = result.rows
          .map((row) => row.doc as LogDoc)
          .filter((doc) => !doc._id?.startsWith('_design'))
      } catch (err) {
        console.error('Erreur logs', err)
      }
    },

    async addLog(action: string, details: string) {
      if (!this.logsLocalDB) return
      try {
        const id = new Date().toISOString()
        const newLog: LogDoc = {
          _id: id,
          action,
          details,
          date: new Date().toLocaleString('fr-FR'),
        }
        await this.logsLocalDB.put(newLog)
        await this.fetchLogs()
      } catch (err) {
        console.error("Impossible d'ajouter le log", err)
      }
    },

    async createData() {
      if (!this.localDB) return
      try {
        const newDoc: InfraDoc = {
          _id: new Date().toISOString(),
          title: this.form.title,
          content: this.form.content,
          category: this.form.category,
          likes: 0,
          comments: [],
          created_at: new Date().toISOString(),
        }

        await this.localDB.put(newDoc)
        await this.addLog('Création', `Message "${newDoc.title}" créé`)
        this.resetForm()
        await this.fetchData()
      } catch (err) {
        this.error = 'Erreur création : ' + (err as Error).message
      }
    },

    async updateData() {
      if (!this.localDB || !this.form._id || !this.form._rev) return
      try {
        const originalDoc = await this.localDB.get(this.form._id)
        const updatedDoc: InfraDoc = {
          ...originalDoc,
          title: this.form.title,
          content: this.form.content,
          category: this.form.category,
        }
        await this.localDB.put(updatedDoc)
        await this.addLog('Modification', `Message "${updatedDoc.title}" modifié`)
        this.resetForm()
        await this.fetchData()
      } catch (err) {
        this.error = 'Erreur modification : ' + (err as Error).message
      }
    },

    async deleteData(doc: InfraDoc) {
      if (!this.localDB || !doc._id || !doc._rev) return
      if (!confirm('Voulez-vous vraiment supprimer ce message ?')) return

      try {
        await this.localDB.remove(doc._id, doc._rev)
        await this.addLog('Suppression', `Message "${doc.title}" supprimé`)
        await this.fetchData()
      } catch (err) {
        this.error = 'Erreur suppression : ' + (err as Error).message
      }
    },

    async likeMessage(doc: InfraDoc) {
      if (!this.localDB || !doc._id) return
      try {
        const docToUpdate = { ...doc }
        docToUpdate.likes = (docToUpdate.likes || 0) + 1
        await this.localDB.put(docToUpdate)
        await this.fetchData()
      } catch (err) {
        if ((err as any).name === 'conflict') {
          this.fetchData()
        } else {
          this.error = 'Erreur like : ' + (err as Error).message
        }
      }
    },

    async addComment(doc: InfraDoc, commentText: string) {
      if (!this.localDB || !doc._id || !commentText.trim()) return
      try {
        const docToUpdate = { ...doc }
        if (!docToUpdate.comments) docToUpdate.comments = []
        docToUpdate.comments.push(commentText)
        await this.localDB.put(docToUpdate)
        await this.fetchData()
      } catch (err) {
        this.error = 'Erreur commentaire : ' + (err as Error).message
      }
    },

    async deleteComment(doc: InfraDoc, index: number) {
      if (!this.localDB || !doc._id) return
      try {
        const docToUpdate = { ...doc }
        docToUpdate.comments.splice(index, 1)
        await this.localDB.put(docToUpdate)
        await this.fetchData()
      } catch (err) {
        this.error = 'Erreur suppression com : ' + (err as Error).message
      }
    },

    toggleSync() {
      if (this.isOffline) {
        this.startSync()
      } else {
        this.stopSync()
      }
    },

    startSync() {
      if (!this.localDB || !this.remoteDB || !this.logsLocalDB || !this.logsRemoteDB) return
      this.isOffline = false
      this.syncStatus = 'Synchronisation...'

      const syncOptions = { live: true, retry: true }

      this.syncHandler = PouchDB.sync(this.localDB, this.remoteDB, syncOptions)
        .on('change', (info) => {
          this.syncStatus = 'Connecté (Données à jour)'
          if (info.direction === 'pull') {
            this.fetchData()
          }
        })
        .on('paused', () => {
          this.syncStatus = 'Connecté'
        })
        .on('active', () => {
          this.syncStatus = 'Synchronisation...'
        })
        .on('error', (err) => {
          this.syncStatus = 'Erreur Réseau'
          this.error = 'Erreur Synchro : ' + (err as Error).message
        })

      this.logsSyncHandler = PouchDB.sync(this.logsLocalDB, this.logsRemoteDB, syncOptions)
        .on('change', () => this.fetchLogs())
        .on('error', (err) => console.error('Erreur Synchro Logs', err))
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
      this.syncStatus = 'Déconnecté'
    },

    async generateFakeData() {
      if (!this.localDB) return
      const fakeDocs: InfraDoc[] = []
      const categories = ['Travail', 'Personnel', 'Urgent', 'Général']

      for (let i = 0; i < 3; i++) {
        fakeDocs.push({
          _id: new Date().toISOString() + Math.random(),
          title: `Sujet ${Math.floor(Math.random() * 1000)}`,
          content: `Contenu généré ${i}. Lorem ipsum dolor sit amet.`,
          likes: Math.floor(Math.random() * 20),
          comments: [],
          category: categories[Math.floor(Math.random() * categories.length)],
          created_at: new Date().toISOString(),
        })
      }
      try {
        await this.localDB.bulkDocs(fakeDocs)
        await this.addLog('Factory', '3 documents générés')
        await this.fetchData()
      } catch (err) {
        this.error = 'Erreur Factory : ' + (err as Error).message
      }
    },

    startEdit(doc: InfraDoc) {
      this.isEdit = true
      this.form = JSON.parse(JSON.stringify(doc))
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
        category: 'Général',
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
  <div class="full-screen-wrapper">
    <div class="app-layout">
      <header class="main-header">
        <div class="header-brand">
          <h1>InfraSync</h1>
          <div class="subtitle">
            <span class="user-name">Steve Benjamin</span>
            <span class="class-tag">M53-1</span>
          </div>
        </div>

        <div class="sync-status-container">
          <div class="indicator" :class="isOffline ? 'offline' : 'online'">
            <span class="led"></span>
            <span class="status-text">{{ syncStatus }}</span>
          </div>
          <button @click="toggleSync" class="sync-btn" :class="isOffline ? 'btn-green' : 'btn-red'">
            {{ isOffline ? 'Passer en ligne' : 'Déconnecter' }}
          </button>
        </div>
      </header>

      <div v-if="error" class="error-banner">
        <span>⚠️ {{ error }}</span>
        <button @click="error = ''">✕</button>
      </div>

      <div class="content-wrapper">
        <aside class="sidebar">
          <div class="panel factory-panel">
            <button @click="generateFakeData" class="btn-action full-width">
              🎲 Générer Données (Factory)
            </button>
          </div>

          <div class="panel form-panel">
            <h2>{{ isEdit ? 'Modifier' : 'Nouveau Message' }}</h2>
            <form @submit.prevent="submitForm">
              <div class="input-group">
                <input v-model="form.title" required placeholder="Titre du message" />
              </div>

              <div class="input-group">
                <select v-model="form.category">
                  <option>Général</option>
                  <option>Travail</option>
                  <option>Personnel</option>
                  <option>Urgent</option>
                </select>
              </div>

              <div class="input-group">
                <textarea
                  v-model="form.content"
                  required
                  rows="5"
                  placeholder="Votre contenu..."
                ></textarea>
              </div>

              <div class="form-actions">
                <button type="submit" class="btn-primary full-width">
                  {{ isEdit ? 'Sauvegarder' : 'Publier' }}
                </button>
                <button
                  v-if="isEdit"
                  type="button"
                  @click="resetForm"
                  class="btn-secondary full-width"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>

          <div class="panel logs-panel">
            <h2>Historique</h2>
            <div class="logs-scroll">
              <div v-for="log in logs" :key="log._id" class="log-entry">
                <span class="time">{{ log.date.split(' ')[1] }}</span>
                <span class="action">{{ log.action }}</span>
                <span class="detail">{{ log.details }}</span>
              </div>
              <div v-if="logs.length === 0" class="empty-logs">Vide</div>
            </div>
          </div>
        </aside>

        <main class="feed-container">
          <div class="panel filters">
            <div class="search-box">
              <span class="icon">🔍</span>
              <input
                v-model="searchQuery"
                @input="fetchData"
                placeholder="Rechercher un titre..."
              />
            </div>
            <div class="toggle-box">
              <input type="checkbox" id="sort" v-model="sortByLikes" @change="fetchData" />
              <label for="sort">Trier par Likes ❤️</label>
            </div>
          </div>

          <div class="cards-list">
            <div v-if="docs.length === 0" class="empty-feed">
              <p>Aucun message à afficher.</p>
            </div>

            <article v-for="doc in docs" :key="doc._id" class="msg-card">
              <div class="card-top">
                <div class="card-title">
                  <h3>{{ doc.title }}</h3>
                  <span class="badge" :class="doc.category">{{ doc.category }}</span>
                </div>
                <button @click="likeMessage(doc)" class="heart-btn">❤️ {{ doc.likes }}</button>
              </div>

              <div class="card-content">
                {{ doc.content }}
              </div>

              <div class="card-comments">
                <div class="comments-list">
                  <div v-for="(com, idx) in doc.comments" :key="idx" class="comment-bubble">
                    <span>{{ com }}</span>
                    <button @click="deleteComment(doc, idx)" class="del-com">×</button>
                  </div>
                </div>
                <input
                  class="add-com-input"
                  placeholder="Écrire un commentaire..."
                  @keyup.enter="
                    addComment(doc, ($event.target as HTMLInputElement).value)
                    ;($event.target as HTMLInputElement).value = ''
                  "
                />
              </div>

              <div class="card-actions">
                <span class="uuid">ID: {{ doc._id?.slice(0, 6) }}</span>
                <div class="buttons">
                  <button @click="startEdit(doc)">✏️</button>
                  <button @click="deleteData(doc)" class="danger">🗑️</button>
                </div>
              </div>
            </article>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- DARK THEME & LAYOUT VARIABLES --- */
:root {
  --bg-dark: #121212;
  --bg-panel: #1e1e1e;
  --bg-input: #2c2c2c;
  --text-main: #e0e0e0;
  --text-dim: #a0a0a0;
  --accent: #bb86fc;
  --primary: #3700b3;
  --border: #333;
}

/* Wrapper global pour centrer et prendre toute la hauteur */
.full-screen-wrapper {
  background-color: #121212; /* Dark background global */
  color: #e0e0e0;
  min-height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center; /* Centre le contenu horizontalement */
  font-family: 'Inter', sans-serif;
}

/* Conteneur principal */
.app-layout {
  width: 100%;
  max-width: 1600px; /* Largeur max pour ne pas trop étirer sur grand écran */
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* --- HEADER --- */
.main-header {
  background-color: #1e1e1e;
  padding: 15px 25px;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #333;
}

.header-brand h1 {
  margin: 0;
  font-size: 1.5rem;
  background: linear-gradient(45deg, #bb86fc, #03dac6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subtitle {
  font-size: 0.85rem;
  color: #a0a0a0;
  margin-top: 4px;
}
.class-tag {
  background: #333;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
  font-size: 0.75rem;
}

.sync-status-container {
  display: flex;
  align-items: center;
  gap: 15px;
}
.indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: bold;
}
.led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.online {
  color: #03dac6;
}
.online .led {
  background: #03dac6;
  box-shadow: 0 0 8px #03dac6;
}
.offline {
  color: #cf6679;
}
.offline .led {
  background: #cf6679;
}

.sync-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: bold;
}
.btn-green {
  background: #03dac6;
  color: #000;
}
.btn-red {
  background: #cf6679;
  color: #000;
}

/* --- GRID LAYOUT --- */
.content-wrapper {
  display: grid;
  grid-template-columns: 350px 1fr; /* Sidebar fixe, Reste flexible */
  gap: 20px;
  align-items: start;
}

/* --- PANELS (Commun) --- */
.panel {
  background: #1e1e1e;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #333;
  margin-bottom: 20px;
}
.panel h2 {
  margin: 0 0 15px 0;
  font-size: 1.1rem;
  color: #fff;
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
}

/* --- SIDEBAR --- */
.btn-action {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  padding: 10px;
  width: 100%;
  border-radius: 6px;
  cursor: pointer;
}
.btn-action:hover {
  background: #444;
}

.input-group {
  margin-bottom: 12px;
}
input,
select,
textarea {
  width: 100%;
  background: #2c2c2c;
  border: 1px solid #444;
  color: #fff;
  padding: 10px;
  border-radius: 6px;
  font-family: inherit;
}
input:focus,
textarea:focus {
  border-color: #bb86fc;
  outline: none;
}

.btn-primary {
  background: #bb86fc;
  color: #000;
  border: none;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  margin-bottom: 5px;
}
.btn-secondary {
  background: transparent;
  color: #a0a0a0;
  border: 1px solid #444;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}

.logs-scroll {
  max-height: 300px;
  overflow-y: auto;
  font-size: 0.8rem;
}
.log-entry {
  border-bottom: 1px solid #333;
  padding: 6px 0;
  display: flex;
  gap: 8px;
}
.log-entry .time {
  color: #666;
  font-family: monospace;
}
.log-entry .action {
  color: #03dac6;
  font-weight: bold;
}

/* --- FEED & FILTERS --- */
.filters {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.search-box {
  flex-grow: 1;
  margin-right: 20px;
  position: relative;
}
.search-box input {
  padding-left: 35px;
}
.search-box .icon {
  position: absolute;
  left: 10px;
  top: 10px;
}
.toggle-box {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

/* --- CARDS --- */
.cards-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.msg-card {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 20px;
  transition: transform 0.2s;
}
.msg-card:hover {
  border-color: #555;
  transform: translateY(-2px);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}
.card-title h3 {
  margin: 0;
  font-size: 1.2rem;
}
.badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: #333;
  margin-top: 5px;
  display: inline-block;
}
.badge.Urgent {
  background: #cf6679;
  color: black;
}
.badge.Travail {
  background: #03dac6;
  color: black;
}

.heart-btn {
  background: #2c2c2c;
  border: 1px solid #cf6679;
  color: #cf6679;
  padding: 5px 12px;
  border-radius: 20px;
  cursor: pointer;
}
.heart-btn:hover {
  background: #cf6679;
  color: white;
}

.card-content {
  margin-bottom: 20px;
  line-height: 1.5;
  color: #ccc;
}

.card-comments {
  background: #151515;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 15px;
}
.comment-bubble {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #333;
  padding: 5px 0;
  font-size: 0.9rem;
}
.del-com {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
}
.del-com:hover {
  color: #cf6679;
}
.add-com-input {
  margin-top: 10px;
  background: #1e1e1e;
  font-size: 0.9rem;
  padding: 8px;
}

.card-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #666;
}
.card-actions button {
  background: #2c2c2c;
  border: 1px solid #444;
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 5px;
}
.card-actions button.danger:hover {
  border-color: #cf6679;
  background: #3a1c22;
}

/* ERROR BANNER */
.error-banner {
  background: #cf6679;
  color: black;
  padding: 10px 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}
.error-banner button {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .content-wrapper {
    grid-template-columns: 1fr;
  }
  .sidebar {
    order: 2;
  }
  .feed-container {
    order: 1;
  }
}
</style>
