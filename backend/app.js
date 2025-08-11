import express from 'express'

const app = express()

import rotas_despesas from ("./routes/despesa.js")
import rotas_receitas from ("./routes/receita.js")

app.use(express.json())

app.use('./api/despesa',rotas_despesas)
app.use('./api/receita',rotas_receitas)

