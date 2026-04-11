# 🚀 Deploy su GitHub Pages

## Metodo 1: GitHub Pages (Consigliato)

### Passo 1: Crea il Repository GitHub

1. Vai su https://github.com
2. Clicca **"New Repository"**
3. Nome: `karaoke-night` (o quello che preferisci)
4. **Pubblico** (richiesto per GitHub Pages gratuito)
5. Clicca **"Create repository"**

### Passo 2: Carica i File

#### Opzione A: Da interfaccia web
1. Clicca **"uploading an existing file"**
2. Trascina TUTTI i file della cartella Karaoke:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `visualizer.js`
   - `config.js`
   - `README.md`
3. Clicca **"Commit changes"**

#### Opzione B: Da terminale
```bash
cd c:\Coding\Karaoke

# Inizializza git (se non l'hai già fatto)
git init

# Aggiungi tutti i file
git add .

# Primo commit
git commit -m "Initial commit: Karaoke Night app"

# Aggiungi il remote (sostituisci TUO_USERNAME)
git remote add origin https://github.com/TUO_USERNAME/karaoke-night.git

# Push su main branch
git branch -M main
git push -u origin main
```

### Passo 3: Attiva GitHub Pages

1. Vai nel repository su GitHub
2. Clicca **"Settings"** (in alto a destra)
3. Nella sidebar sinistra, clicca **"Pages"**
4. Sotto **"Source"**, seleziona:
   - Branch: **main**
   - Folder: **/ (root)**
5. Clicca **"Save"**

### Passo 4: Accedi alla Tua App!

Dopo 1-2 minuti, la tua app sarà disponibile a:

```
https://TUO_USERNAME.github.io/karaoke-night/
```

Troverai il link esatto nella pagina Settings → Pages!

---

## Metodo 2: Netlify (Alternativa Veloce)

1. Vai su https://app.netlify.com/drop
2. Trascina la cartella `Karaoke` nella pagina
3. Fatto! Ti dà un link pubblico immediatamente

---

## ⚠️ Importante: API Key YouTube

**Se hai inserito la tua API key in `config.js`**, questa sarà **PUBBLICA** su GitHub!

### Prima di pubblicare, proteggi la tua API key:

1. **Vai su Google Cloud Console**: https://console.cloud.google.com/
2. **Seleziona il tuo progetto**
3. **API & Services → Credentials**
4. **Modifica la tua API Key**
5. **Aggiungi restrizioni HTTP**:
   - "HTTP referrers (websites)"
   - Aggiungi solo il tuo dominio:
     ```
     https://TUO_USERNAME.github.io/karaoke-night/*
     ```
6. **Salva**

Così la tua API key funzionerà SOLO dal tuo sito GitHub Pages e nessuno potrà usarla altrove!

---

## ✅ Funzionerà Su:

- ✅ Desktop browser (Chrome, Firefox, Edge, Safari)
- ✅ Telefono (Android/iOS)
- ✅ Tablet
- ✅ Qualsiasi dispositivo con browser e internet

---

## 🔧 Risoluzione Problemi

### "Non carica nulla"
- Controlla che tutti i file siano nel repository
- Verifica che GitHub Pages sia attivo (Settings → Pages)
- Aspetta 2-3 minuti dopo il deploy

### "YouTube player non funziona"
- Assicurati di aver abilitato **YouTube Data API v3** su Google Cloud
- Controlla che l'API key abbia le restrizioni HTTP corrette
- Apri la console del browser (F12) per vedere errori

### "Le lyrics non si trovano"
- L'API Lyrics.ovh a volte ha limiti di rate
- Prova canzoni famose in inglese
- L'app ha già fallback multipli (Vagalume, LrcLib)

---

## 🎵 Enjoy!

Ora puoi condividere il link con chiunque e cantare karaoke da qualsiasi dispositivo! 🎤✨
