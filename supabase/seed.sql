-- Criando um usuário fictício na tabela nativa de autenticação do Supabase
-- para evitar falhas de restrição de Foreign Key (auth.users)
INSERT INTO auth.users (id, email) 
VALUES ('11111111-1111-1111-1111-111111111111', 'produtor_teste@exemplo.com') 
ON CONFLICT (id) DO NOTHING;

-- Seed de perguntas RTRS (Seção Meio Ambiente e Trabalhista)
INSERT INTO public.perguntas_rtrs (secao, numero_criterio, enunciado) VALUES
('Meio Ambiente', '4.1', 'A propriedade possui mapas indicando o uso do solo e áreas de conservação?'),
('Meio Ambiente', '4.2', 'Não houve desmatamento ilegal após maio de 2009?'),
('Direitos Trabalhistas', '2.1', 'Não existe trabalho infantil ou análogo à escravidão na propriedade?');

-- Seed de uma propriedade simulando a inserção de um polígono fictício com PostGIS (ST_GeomFromText)
INSERT INTO public.propriedades (id, produtor_id, nome_fazenda, nome_produtor, codigo_car, geom)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Fazenda Sustentabilidade RTRS',
    'João Produtor Teste',
    'MT-1234567-ABCD.EFGH.IJKL.MNOP',
    ST_GeomFromText('POLYGON((-56.0 -15.0, -56.0 -14.0, -55.0 -14.0, -55.0 -15.0, -56.0 -15.0))', 4326)
);
