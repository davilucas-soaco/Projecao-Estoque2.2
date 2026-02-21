SELECT
    d.codigo AS 'Codigo_Romaneio',
    d.observacoes AS 'observacoes_Romaneio',
    d.dataEmissao AS 'dataEmissao_Romaneio',
    p.nome AS 'N_Pedido',
    pes.nomeRazaoSocial AS 'Cliente',
    p.dataEmissao AS 'Data_Emissao_Pedido',
    pro.nome AS 'Cod_Produto',
    pro.descricao,
    uni.nome AS 'U.M',
    ip.qtde AS 'Qtd_Pedida',
    ipr.qtdeVinculada AS 'Qtd_Vinculada_no_Romaneio',
    t.nome AS 'Tipo_de_produto_do_item_de_pedido_de_venda',
    ip.precoUnitario AS 'Preco_Unitario',
    ip.dataEntrega AS 'Data_de_Entrega',

CASE 
   WHEN p.localEntregaDifEnderecoDestinatario = 1 
        THEN mun_endereco.nome
   ELSE mun_pessoa.nome
END AS Municipio,

CASE 
   WHEN p.localEntregaDifEnderecoDestinatario = 1 
        THEN mun_endereco.UF
   ELSE mun_pessoa.UF
END AS UF,

CASE 
   WHEN p.localEntregaDifEnderecoDestinatario = 1 
        THEN ende.endereco
   ELSE pes.endereco
END AS Endereco,

    atrlis591.opcao AS 'Metodo_de_entrega',
    atrlis313.opcao AS 'Requisicao_de_Loja_do_grupo'

FROM itempedido ip

JOIN pedido p 
   ON ip.idPedido = p.id

LEFT JOIN itempedidoromaneio ipr 
   ON ipr.idItemPedido = ip.id

LEFT JOIN documentoestoque d 
   ON d.id = ipr.idRomaneio

LEFT JOIN atributopedidovalor atrva591
   ON atrva591.idPedido = p.id
   AND atrva591.idAtributo = 591

LEFT JOIN atributolistaopcao atrlis591
   ON atrlis591.id = atrva591.idListaOpcao

LEFT JOIN atributopedidovalor atrva313
   ON atrva313.idPedido = p.id
   AND atrva313.idAtributo = 313

LEFT JOIN atributolistaopcao atrlis313
   ON atrlis313.id = atrva313.idListaOpcao

JOIN produto pro
   ON pro.id = ip.idProduto

JOIN unidademedida uni
   ON pro.idUnidadeMedida = uni.id

JOIN tipoproduto t
   ON t.id = pro.idTipoProduto

JOIN pessoa pes 
   ON p.idCliente = pes.id
   
LEFT JOIN municipio mun_pessoa
   ON pes.idMunicipio = mun_pessoa.id
   
LEFT JOIN endereco ende
   ON p.idEnderecoLocalEntrega = ende.id

LEFT JOIN municipio mun_endereco
   ON ende.idMunicipio = mun_endereco.id  

WHERE (d.idTipoRomaneio = 1 OR d.idTipoRomaneio IS NULL) AND ip.status IN (1,2,3)

ORDER BY d.dataEmissao DESC, p.nome DESC;
