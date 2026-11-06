import express from 'express';
import store from '../database.js';

const router = express.Router();
router.get('/', (_req, res) => res.json(store.list('receita')));
router.post('/', (req, res) => {
  const nova_receita = store.create('receita', req.body);
  res.status(201).json({ message: 'Receita adicionada com sucesso!', nova_receita, ...store.state() });
});
router.delete('/:id', (req, res) => {
  store.remove('receita', req.params.id);
  res.json({ message: 'Receita removida com sucesso!', ...store.state() });
});
router.patch('/:id', (req, res) => {
  const receita = store.update('receita', req.params.id, req.body);
  res.json({ message: 'Receita atualizada com sucesso!', receita, ...store.state() });
});

export default router;
