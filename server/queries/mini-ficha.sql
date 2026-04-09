SELECT
    p.nome AS codigo_estante,
    p.descricao AS desc_estante,

    MAX(CASE
        WHEN p2.descricao LIKE '%coluna%estante%'
        THEN p2.nome
    END) AS cod_coluna,

    MAX(CASE
        WHEN p2.descricao LIKE '%coluna%estante%'
        THEN p2.descricao
    END) AS desc_coluna,

    MAX(CASE
        WHEN p2.descricao LIKE '%coluna%estante%'
        THEN pq.qtdeNecessaria
    END) AS qtd_coluna,

    MAX(CASE
        WHEN p2.descricao LIKE '%bandeja%estante%'
        THEN p2.nome
    END) AS cod_bandeja,

    MAX(CASE
        WHEN p2.descricao LIKE '%bandeja%estante%'
        THEN p2.descricao
    END) AS desc_bandeja,

    MAX(CASE
        WHEN p2.descricao LIKE '%bandeja%estante%'
        THEN pq.qtdeNecessaria
    END) AS qtd_bandeja

FROM produtoqtde pq
LEFT JOIN produto p
    ON pq.idProduto = p.id
LEFT JOIN produto p2
    ON pq.idProdutoComponente = p2.id
LEFT JOIN listamateriais l
    ON pq.idListaMateriais = l.id

WHERE l.descricao LIKE '%produ%'
  AND p.descricao LIKE '%estante%de%'
  AND (
        p2.descricao LIKE '%bandeja%estante%'
     OR p2.descricao LIKE '%coluna%estante%'
  )

GROUP BY
    p.nome,
    p.descricao;
