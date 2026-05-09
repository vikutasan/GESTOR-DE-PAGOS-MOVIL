const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(file, 'utf8');

// Añadir importación de db.js
if (!content.includes("import { initDB")) {
  content = content.replace("import './App.css';", "import './App.css';\nimport { initDB, getDashboard, getCards, saveCard, getTransactions, saveTransaction, getSalaries, updateSalaryStatus, getSuggestions, syncCard } from './services/db';");
}

// Reemplazar fetchData
content = content.replace(/const dbRes = await fetch.*\/api\/dashboard.*\n.*const dbData = await dbRes\.json\(\);/g, "await initDB();\n      const dbData = await getDashboard();");
content = content.replace(/const cardsRes = await fetch.*\/api\/cards.*\n.*const cardsData = await cardsRes\.json\(\);/g, "const cardsData = await getCards();");
content = content.replace(/const sugRes = await fetch.*\/api\/suggestions.*\n.*const sugData = await sugRes\.json\(\);/g, "const sugData = await getSuggestions();");
content = content.replace(/const salRes = await fetch.*\/api\/salaries.*\n.*const salData = await salRes\.json\(\);/g, "const salData = await getSalaries();");
content = content.replace(/const transRes = await fetch.*\/api\/transactions.*\n.*const transData = await transRes\.json\(\);/g, "const transData = await getTransactions();");

// Reemplazar submit transaction
content = content.replace(/await fetch\(`?http:\/\/.*?\/api\/transactions`?, \{\n\s*method: 'POST',\n\s*headers: \{ 'Content-Type': 'application\/json' \},\n\s*body: JSON\.stringify\(formData\)\n\s*\}\);/g, "await saveTransaction(formData);");

// Reemplazar submit card
const submitCardRegex = /const url = editingCardId\s*\?[^;]+;\s*const method = editingCardId \? 'PUT' : 'POST';\s*await fetch\(url, \{\s*method,\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(cardData\)\s*\}\);/gs;
content = content.replace(submitCardRegex, "await saveCard(cardData, editingCardId);");

// Reemplazar update salary status
const updateSalaryRegex = /await fetch\(`?http:\/\/.*?\/api\/salaries\/\$\{id\}`?, \{\s*method: 'PUT',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(\{ status: newStatus \}\)\s*\}\);/gs;
content = content.replace(updateSalaryRegex, "await updateSalaryStatus(id, newStatus);");

// Reemplazar sync card
const syncCardRegex = /const res = await fetch\(`?http:\/\/.*?\/api\/cards\/\$\{syncSelectedCardId\}\/sync`?, \{\s*method: 'PUT',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(\{ metadata: syncData\.metadata \}\)\s*\}\);\s*if\s*\(res\.ok\)/gs;
content = content.replace(syncCardRegex, "const res = await syncCard(syncSelectedCardId, syncData.metadata);\n                        if(res.updated)");

// Remover `await res.json()` en sync
content = content.replace(/const error = await res\.json\(\);/g, "const error = { error: e.message };");
content = content.replace(/} catch\(e\) {/g, "} catch(e) {");

// Arreglar las recargas en syncCard
content = content.replace(/const cardsRes = await fetch\(`?http:\/\/.*?\/api\/cards`?\);\n\s*setCards\(await cardsRes\.json\(\)\);/g, "setCards(await getCards());");
content = content.replace(/const dashRes = await fetch\(`?http:\/\/.*?\/api\/dashboard`?\);\n\s*setDashboard\(await dashRes\.json\(\)\);/g, "setDashboard(await getDashboard());");

fs.writeFileSync(file, content);
