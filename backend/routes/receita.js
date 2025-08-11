import express from 'express';

const router = express.Router();

function compare_receitas(id) {
    return receitas.find(d => d.id === Number(id));
};

const receitas = [
   
];

router.get('/', ( _ , res) => {
    res.json(receitas)
});

router.post('/', (req , res) => {
    const nova_receita = {
        id: receitas.length + 1,
        descricao: req.body.descricao,
        valor: req.body.valor,
        data: new Date(req.body.data),
    };
    
    receitas.push(nova_receita);

    return res.status(201).json({ message: 'Receita adicionada com sucesso!', nova_receita});
});

router.delete('/:id', (req , res) => {
    try {
        const id = req.params.id;
        const receita_encontrada = compare_receitas(id)
        const posicao = receitas.indexOf(receita_encontrada);

        if(!receita_encontrada) {
            return res.status(404).json({message: 'Receita não encontrada, tente novamente...'})
        }

        if (posicao > -1) {
            receitas.splice(posicao, 1)
        }    
        
    } catch (error) {
        res.status(500).json({erro: 'Algo não deu certo.'})
    }

    return res.json({ message: 'Receitas removida com sucesso!'});
});

router.patch('/:id', (req, res) => {
    try {
        const id = req.params.id;
        const receita_encontrada = compare_receitas(id)
        
        if(!receita_encontrada) {
            return res.status(404).json({message: 'receita não encontrada, tente novamente...'})
        }

        const invalid_keys = Object.keys(req.body).filter((keys) => !(keys in receita_encontrada));

        if(invalid_keys.length > 0){
            return res.status(400).json({
                message: 'Campos inválidos no body.',
                invalidFields: invalid_keys,
            })
        }

        Object.keys(req.body).forEach((keys) => {
            if(keys in receita_encontrada){
                receita_encontrada[keys] = req.body[keys];
            }
        })

        res.status(201).json({ message: 'receitas atualizadas com sucesso!', receitas: receita_encontrada});

    } catch (error) {
        res.status(500).json({erro: 'Algo não deu certo, veja se inseriu as mudanças corretamente!'})
    }    
})

export default router
