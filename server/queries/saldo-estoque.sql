SELECT
    ultimos_saldos.idProduto AS 'idProduto',
    ultimos_saldos.cod AS 'codigo',
    ultimos_saldos.idTipoProduto AS 'idTipoProduto',
    setpad.nome AS 'setorEstoquePadrao',
    ultimos_saldos.descricao AS 'descricao',
    ultimos_saldos.setorEstoque AS 'setorEstoque',
    ultimos_saldos.saldoSetorFinal AS 'saldoSetorFinal'
FROM (
    SELECT
        sep.id,
        sep.idProduto,
        p.nome AS cod,
        p.descricao AS descricao,
		p.idTipoProduto,
        sep.idSetorEstoque,
        se.nome AS setorEstoque,
        sep.idEmpresa,
        sep.dataMovimentacao,
        CASE
            WHEN sep.saldoSetorFinal <= 0 THEN sep.saldoSetorFinal
            ELSE sep.saldoSetorFinal
        END AS saldoFinal,
        sep.qtdeEntrada,
        sep.qtdeSaida,
        CASE WHEN
        sep.saldoSetorFinal <= 0 THEN sep.saldoSetorFinal
        ELSE sep.saldoSetorFinal END AS saldoSetorFinal,
        sep.idMovimentacao,
        tm.nome,
        ROW_NUMBER() OVER (
            PARTITION BY sep.idProduto, sep.idSetorEstoque
            ORDER BY sep.dataMovimentacao DESC, sep.id DESC
        ) AS rn
    FROM saldoestoque_produto sep
    LEFT JOIN setorestoque se ON se.id = sep.idSetorEstoque
    LEFT JOIN produto p ON p.id = sep.idProduto
    LEFT JOIN movimentacaoproducao mp ON mp.id = sep.idMovimentacao
    LEFT JOIN tipomovimentacao tm ON tm.id = mp.idTipoMovimentacao
    WHERE se.consideraComoSaldoDisponivel = 1
      AND p.ativo = 1
      AND p.idTipoProduto IN (8,15)
      AND se.id IN (5,24)
      AND se.idEmpresa = 1

) AS ultimos_saldos
LEFT JOIN
(SELECT
p.idProduto,
p.idSetorEstoquePadrao,
sep.nome
FROM produtoempresa p
LEFT JOIN setorestoque sep ON sep.id = p.idSetorEstoquePadrao
WHERE p.idEmpresa = 1) setpad ON ultimos_saldos.idProduto = setpad.idProduto
WHERE rn = 1;
