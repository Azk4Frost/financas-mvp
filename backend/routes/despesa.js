import express from 'express';

const router = express.Router();

function compare_despesa(id) {
    return despesas.find(d => d.id === Number(id));
};

const despesas = [
    { 
        id: 1, 
        descricao: 'Alimentação', 
        valor: 500,
        data: new Date('2025-06-14'),
    },

    { 
        id: 2, 
        descricao: 'Cartão de Crédito', 
        valor: 1200,
        data: new Date('2025-12-25'),
    }
];

router.get('/', ( _ , res) => {
    return res.json(despesas)
});

router.post('/', (req , res) => {
    const nova_despesa = {
        id: despesas.length + 1,
        descricao: req.body.descricao,
        valor: req.body.valor,
        data: new Date(req.body.data),
    };
    
    despesas.push(nova_despesa);

    return res.status(201).json({ message: 'Despesa adicionada com sucesso!', nova_despesa});
});

router.delete('/:id', (req , _ ) => {
    try {
        const id = req.params.id;
        const despesa_encontrada = compare_despesa(id)
        const posicao = despesas.indexOf(despesa_encontrada);

        if(!despesa_encontrada) {
            return res.status(404).json({message: 'Despesa não encontrada, tente novamente...'})
        }

        if (posicao > -1) {
            despesas.splice(posicao, 1)
        }    
        
    } catch (error) {
        res.status(500).json({erro: 'Algo não deu certo.'})
    }

    res.json({ message: 'Despesa removida com sucesso!'});
});

router.patch('/:id', (req, res) => {
    try {

        const id = req.params.id;
        const despesa_encontrada = compare_despesa(id)
        if(!despesa_encontrada) {
            return res.status(404).json({message: 'Despesa não encontrada, tente novamente...'})
        }

        const invalid_keys = Object.keys(req.body).filter((keys) => !(keys in despesa_encontrada));

        if(invalid_keys.length > 0){
            return res.status(400).json({
                message: 'Campos inválidos no body.',
                invalidFields: invalid_keys,
            })
        }

        Object.keys(req.body).forEach((keys) => {
            if(keys in despesa_encontrada){
                despesa_encontrada[keys] = req.body[keys];
            }
        })

        res.status(201).json({ message: 'Despesa atualizada com sucesso!', despesa: despesa_encontrada});

    } catch (error) {
        res.status(500).json({erro: 'Algo não deu certo, veja se inseriu as despesas corretamente!'})
    }    
})

export default router

