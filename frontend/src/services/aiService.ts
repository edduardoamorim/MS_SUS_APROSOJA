import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("VITE_GEMINI_API_KEY não está configurada no .env.local");
}

const genAI = new GoogleGenerativeAI(API_KEY || '');

export const aiService = {
  /**
   * Gera um briefing executivo para o Gestor.
   */
  async generateGestorBriefing(contextData: any): Promise<string> {
    if (!API_KEY) return "AI Offline: Chave de API não configurada.";
    
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `
        Você é um Diretor Executivo de Agronegócio e Governança auxiliando um Gestor da plataforma MS Sustentável.
        Com base nos dados a seguir, crie um "Briefing Executivo" direto e sofisticado de no máximo 3 linhas.
        Foque em pontos de atenção (auditorias pendentes, fazendas em análise, etc) e dê um tom corporativo encorajador.
        Dados: ${JSON.stringify(contextData)}
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Erro no Gemini AI:", error);
      return "Não foi possível carregar os insights automáticos no momento. Tente novamente mais tarde.";
    }
  },

  /**
   * Gera ações corretivas para a "Pré-Auditoria Inteligente" do Produtor.
   */
  async generateCorrectiveActions(pendingIssues: string): Promise<string> {
    if (!API_KEY) return "AI Offline: Chave de API não configurada.";

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `
        Você é um Consultor Técnico Especialista em Sustentabilidade Agrícola.
        Um produtor rural precisa de ações corretivas imediatas antes da visita do auditor para os seguintes problemas:
        "${pendingIssues}"
        
        Gere uma lista objetiva, prática e acionável de ações para ele resolver esses problemas.
        Mantenha um tom profissional, orientador e encorajador. Use formatação Markdown (bullet points, negritos) para fácil leitura.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Erro no Gemini AI:", error);
      return "Não foi possível gerar o plano de ação no momento. Tente novamente mais tarde.";
    }
  }
};
