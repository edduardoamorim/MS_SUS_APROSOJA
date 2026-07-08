import os
import pytest
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. ARQUIVO DE CONFIGURAÇÃO: Carregar variáveis do keys.env
load_dotenv(dotenv_path="keys.env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

@pytest.fixture
def admin_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        pytest.fail("Variáveis SUPABASE_URL ou SUPABASE_SERVICE_KEY não encontradas no arquivo keys.env.")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

@pytest.fixture
def anon_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        pytest.fail("Variáveis SUPABASE_URL ou SUPABASE_ANON_KEY não encontradas no arquivo keys.env.")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# 2. TESTE DO REGEX DO CAR
def test_car_validation_regex(admin_client: Client):
    """
    Tenta inserir um registro com formato de CAR inválido na tabela propriedades.
    Espera-se uma exceção do banco de dados (violação da CHECK constraint).
    """
    invalid_data = {
        "car": "CAR-INVALIDO",
        # Caso a tabela exija outros campos NOT NULL, eles podem ser adicionados aqui.
    }
    
    with pytest.raises(Exception) as exc_info:
        admin_client.table("propriedades").insert(invalid_data).execute()
        
    error_msg = str(exc_info.value).lower()
    # Verifica se a mensagem retornada se refere a uma violação de check constraint
    assert "check" in error_msg or "constraint" in error_msg or "car" in error_msg, \
        f"A exceção lançada não parece ser de validação de constraint. Detalhes: {error_msg}"

# 3. TESTE DE ISOLAMENTO (RLS)
def test_producer_rls_isolation(anon_client: Client):
    """
    Utiliza a chave anônima para tentar ler os dados de propriedades.
    Como o usuário não está autenticado e o RLS está ativo, a resposta deve ser uma lista vazia.
    """
    response = anon_client.table("propriedades").select("*").execute()
    
    assert response.data == [], "Falha de segurança RLS: Dados da tabela 'propriedades' foram expostos para um cliente anônimo."

# 4. TESTE ESPACIAL (POSTGIS)
def test_postgis_geometry_read(admin_client: Client):
    """
    Testa se o cliente Python consegue realizar uma consulta em uma tabela
    contendo tipos espaciais (geometry) do PostGIS sem erros de serialização.
    """
    try:
        # Apenas tenta ler o registro para validar a interação com colunas espaciais.
        # O PostgREST lida com a tradução do tipo geometry de forma transparente (geralmente como GeoJSON).
        response = admin_client.table("propriedades").select("*").limit(1).execute()
        
        assert isinstance(response.data, list), "O retorno da consulta deveria ser uma lista."
    except Exception as e:
        pytest.fail(f"Falha ao ler dados da tabela espacial (possível problema de integração com PostGIS/Supabase): {e}")
