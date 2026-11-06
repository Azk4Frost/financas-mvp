import express from 'express';
import store from '../database.js';

const router = express.Router();
router.get('/', (_req, res) => res.json(store.list('despesa')));
router.post('/', (req, res) => {
  const nova_despesa = store.create('despesa', req.body);
  res.status(201).json({ message: 'Despesa adicionada com sucesso!', nova_despesa, ...store.state() });
});
router.delete('/:id', (req, res) => {
  store.remove('despesa', req.params.id);
  res.json({ message: 'Despesa removida com sucesso!', ...store.state() });
});
router.patch('/:id', (req, res) => {
  const despesa = store.update('despesa', req.params.id, req.body);
  res.json({ message: 'Despesa atualizada com sucesso!', despesa, ...store.state() });
});

export default router;
