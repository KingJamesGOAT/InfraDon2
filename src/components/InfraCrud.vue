<script lang="ts">
import { defineComponent } from 'vue'
import PouchDB from 'pouchdb'

type InfraDoc = {
  _id?: string
  _rev?: string
  name: string
  content: string
  created_at: string
}

// 1. CORRECTED: Using your username, password, and database name
const COUCH_URL = 'http://steve:Goldy_2002_2002@127.0.0.1:5984/infra_53_0850'

// Types simples pour satisfaire TS
type PouchPostResponse = {
  ok: boolean
  id: string
  rev: string
}

type PouchPutResponse = {
  ok: boolean
  id: string
  rev: string
}

type PouchRemoveResponse = {
  ok: boolean
  id: string
  rev: string
}

type PouchAllDocsRow<T> = {
  id: string
  key: string
  value: {
    rev: string
    deleted?: boolean
  }
  doc?: T
}

type PouchAllDocsResult<T> = {
  total_rows: number
  offset: number
  rows: Array<PouchAllDocsRow<T>>
}

export default defineComponent({
  name: 'InfraCrud',

  data() {
    return {
      db: null as null | PouchDB.Database<InfraDoc>,
      loading: false as boolean,
      error: '' as string,

      docs: [] as InfraDoc[],

      form: {
        _id: '',
        _rev: '',
        name: '',
        content: '',
      } as { _id: string; _rev: string; name: string; content: string },

      isEdit: false as boolean,
    }
  },

  methods: {
    // 1. Connexion PouchDB -> CouchDB
    initDatabase(): PouchDB.Database<InfraDoc> {
      if (!this.db) {
        this.db = new PouchDB<InfraDoc>(COUCH_URL)
      }
      return this.db
    },

    // 2. READ: récupérer tous les documents
    async fetchData(): Promise<void> {
      this.loading = true
      this.error = ''
      try {
        const db = this.initDatabase()
        const result: PouchAllDocsResult<InfraDoc> = await db.allDocs({
          include_docs: true,
        })

        this.docs = result.rows.filter((r) => r.doc !== undefined).map((r) => r.doc as InfraDoc)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue dans fetchData'
        this.error = 'Erreur fetchData: ' + msg
        console.error('fetchData error:', err)
      } finally {
        this.loading = false
      }
    },

    // 3. CREATE: créer un doc à partir du formulaire
    async createData(): Promise<void> {
      this.loading = true
      this.error = ''
      try {
        const db = this.initDatabase()

        const newDoc: InfraDoc = {
          name: this.form.name,
          content: this.form.content,
          created_at: new Date().toISOString(),
        }

        const res: PouchPostResponse = await db.post(newDoc)
        console.log('createData ok:', res)

        await this.fetchData() // Refresh list
        this.resetForm()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue dans createData'
        this.error = 'Erreur createData: ' + msg
        console.error('createData error:', err)
      } finally {
        this.loading = false
      }
    },

    // passe en mode édition
    startEdit(doc: InfraDoc): void {
      this.isEdit = true
      this.form._id = doc._id ?? ''
      this.form._rev = doc._rev ?? ''
      this.form.name = doc.name
      this.form.content = doc.content
    },

    // 4. UPDATE: sauvegarder les modifs
    async updateData(): Promise<void> {
      this.loading = true
      this.error = ''
      try {
        const db = this.initDatabase()

        if (!this.form._id || !this.form._rev) {
          throw new Error('Pas _id / _rev')
        }

        // 2. CORRECTED: Find the original doc to preserve the created_at date
        const originalDoc = this.docs.find((doc) => doc._id === this.form._id)
        const createdAt = originalDoc ? originalDoc.created_at : new Date().toISOString() // Fallback just in case

        const updatedDoc: InfraDoc = {
          _id: this.form._id,
          _rev: this.form._rev,
          name: this.form.name,
          content: this.form.content,
          created_at: createdAt, // Use the original created_at date
        }

        const res: PouchPutResponse = await db.put(updatedDoc)
        console.log('updateData ok:', res)

        await this.fetchData() // Refresh list
        this.resetForm()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue dans updateData'
        this.error = 'Erreur updateData: ' + msg
        console.error('updateData error:', err)
      } finally {
        this.loading = false
      }
    },

    // 5. DELETE
    async deleteData(id: string, rev: string): Promise<void> {
      this.loading = true
      this.error = ''
      try {
        // 3. CORRECTED: Add check for id and rev
        if (!id || !rev) {
          throw new Error('ID or revision is missing, cannot delete.')
        }

        const db = this.initDatabase()

        const res: PouchRemoveResponse = await db.remove(id, rev)
        console.log('deleteData ok:', res)

        await this.fetchData() // Refresh list

        if (this.form._id === id) {
          this.resetForm()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue dans deleteData'
        this.error = 'Erreur deleteData: ' + msg
        console.error('deleteData error:', err)
      } finally {
        this.loading = false
      }
    },

    // reset du formulaire (repasse en mode création)
    resetForm(): void {
      this.isEdit = false
      this.form = {
        _id: '',
        _rev: '',
        name: '',
        content: '',
      }
    },

    // bouton principal du form
    async submitForm(): Promise<void> {
      if (this.isEdit) {
        await this.updateData()
      } else {
        await this.createData()
      }
    },
  },

  async mounted() {
    this.initDatabase()
    await this.fetchData()
  },
})
</script>

<template>
  <main class="screen">
    <section class="container">
      <h1 class="page-title">Infra CRUD test</h1>

      <div class="status">
        <p v-if="loading" class="info">Chargement</p>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <!-- FORMULAIRE -->
      <form class="card form" @submit.prevent="submitForm">
        <h2 class="card-title">
          {{ isEdit ? 'Modifier le document' : 'Nouveau document' }}
        </h2>

        <div class="field">
          <label for="name">Nom</label>
          <input id="name" type="text" v-model="form.name" required placeholder="Nom du document" />
        </div>

        <div class="field">
          <label for="content">Contenu</label>
          <textarea
            id="content"
            v-model="form.content"
            required
            placeholder="Contenu du document"
            rows="4"
          ></textarea>
        </div>

        <div class="buttons-row">
          <button type="submit" class="btn primary">
            {{ isEdit ? 'Enregistrer' : 'Créer' }}
          </button>

          <button type="button" v-if="isEdit" class="btn secondary" @click="resetForm">
            Annuler
          </button>
        </div>

        <div v-if="isEdit" class="meta">
          <p>
            <strong>ID:</strong>
            {{ form._id }}
          </p>
          <p>
            <strong>rev:</strong>
            {{ form._rev }}
          </p>
        </div>
      </form>

      <!-- LISTE DES DOCS -->
      <section class="card list">
        <h2 class="card-title">Documents en base</h2>

        <p v-if="docs.length === 0" class="empty">Aucun document.</p>

        <ul v-else class="doc-list">
          <li v-for="doc in docs" :key="doc._id" class="doc-item">
            <div class="doc-main">
              <p class="doc-name">
                <strong>{{ doc.name }}</strong>
              </p>
              <p class="doc-content">{{ doc.content }}</p>
              <p class="doc-meta">
                <small>
                  <strong>ID:</strong>
                  {{ doc._id }}
                </small>
                <br />
                <small>
                  <strong>rev:</strong>
                  {{ doc._rev }}
                </small>
                <br />
                <small>
                  <strong>created_at:</strong>
                  {{ doc.created_at }}
                </small>
              </p>
            </div>

            <div class="doc-actions">
              <button type="button" class="btn small primary" @click="startEdit(doc)">Edit</button>

              <button
                type="button"
                class="btn small danger"
                @click="deleteData(doc._id || '', doc._rev || '')"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>
      </section>
    </section>
  </main>
</template>

<style scoped>
.screen {
  min-height: 100vh;
  background-color: #1a1a1a;
  color: #f5f5f5;
  display: flex;
  justify-content: center;
  padding: 2rem;
  box-sizing: border-box;
}

.container {
  width: 100%;
  max-width: 600px;
  display: grid;
  gap: 2rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #f5f5f5;
  text-align: center;
  margin: 0;
}

.status .info {
  color: #a0a0ff;
  font-size: 0.9rem;
  margin: 0;
  text-align: center;
}
.status .error {
  color: #ff4a4a;
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
  text-align: center;
}

.card {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
  box-sizing: border-box;
}
.card-title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: #fff;
  font-weight: 500;
}

.form .field {
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
}
.form label {
  font-size: 0.9rem;
  color: #d0d0d0;
  margin-bottom: 0.4rem;
  font-weight: 500;
}
.form input,
.form textarea {
  width: 100%;
  border: 1px solid #555;
  background: #1f1f1f;
  color: #fff;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  line-height: 1.4;
  outline: none;
}
.form input:focus,
.form textarea:focus {
  border-color: #888;
}

.buttons-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}
.btn {
  border: 0;
  border-radius: 6px;
  padding: 0.6rem 1rem;
  font-size: 0.95rem;
  cursor: pointer;
  line-height: 1.2;
  color: #fff;
  white-space: nowrap;
}
.btn.primary {
  background: #3a3a3a;
}
.btn.primary:hover {
  background: #4a4a4a;
}
.btn.secondary {
  background: #555;
}
.btn.secondary:hover {
  background: #666;
}
.btn.danger {
  background: #8a1a1a;
}
.btn.danger:hover {
  background: #a52222;
}
.btn.small {
  font-size: 0.8rem;
  padding: 0.4rem 0.6rem;
}

.meta {
  margin-top: 1rem;
  font-size: 0.75rem;
  color: #aaa;
  background: #1f1f1f;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 0.75rem;
  word-break: break-all;
}

.list .empty {
  font-size: 0.9rem;
  color: #cfcfcf;
  margin: 0;
}

.doc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.doc-item {
  border-top: 1px solid #3a3a3a;
  padding: 1rem 0;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: 1rem;
}
.doc-item:first-child {
  border-top: 0;
}
.doc-main {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.doc-name {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  color: #fff;
}
.doc-content {
  margin: 0 0 0.5rem;
  color: #ddd;
  font-size: 0.9rem;
  line-height: 1.4;
}
.doc-meta {
  font-size: 0.7rem;
  color: #888;
  line-height: 1.4;
}
.doc-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
