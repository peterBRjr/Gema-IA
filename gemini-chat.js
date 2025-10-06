import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BufferMemory } from "langchain/memory";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { RunnableSequence } from "@langchain/core/runnables";
import { Tool } from "@langchain/core/tools";


// --- 1. DEFINIÇÃO DA FUNÇÃO (TOOL) ---

/**
 * Simula a obtenção de uma variável "idade" de uma fonte externa.
 * O modelo só chama esta função quando o usuário perguntar sobre "idade".
 */
class ObterIdadeAtualTool extends Tool {
  name = "obter_idade_atual";
  description = "Retorna a idade atual de uma pessoa ou entidade. Use esta ferramenta quando o usuário perguntar sobre 'minha idade', 'sua idade' ou 'qual a idade'.";
  
  schema = {
    type: "object",
    properties: {},
  };

  /**
   * O método principal de execução da Tool.
   * @param {string} input - Argumentos da função (não utilizados neste exemplo).
   * @returns {Promise<string>} O valor da idade como uma string.
   */
  async _call(input) {
    const idade = 30; 
    console.log(`\n*** TOOL EXECUTADA: Idade retornada: ${idade} ***\n`);
    return `A idade atual é ${idade} anos.`;
  }
}

const tools = [new ObterIdadeAtualTool()];

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  temperature: 0.7,
});

const modelWithTools = model.bind({ tools: tools });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "Você é um assistente prestativo chamado Gema. Responda educadamente e use a ferramenta 'obter_idade_atual' quando necessário."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

const memory = new BufferMemory({
  memoryKey: "chat_history",
  returnMessages: true,
});

// A Chain principal que conecta Prompt -> Modelo com Tools
const chain = RunnableSequence.from([
  {
    input: (i) => i.input, // Passa a entrada do usuário
    chat_history: async (_) => (await memory.loadMemoryVariables({})).chat_history, // Carrega o histórico
  },
  prompt,
  modelWithTools,
]);


// --- 3. LÓGICA DO CHAT (LOOP PRINCIPAL) ---

startChat();

async function startChat() {
  const rl = readline.createInterface({ input, output });
  console.log("Chat iniciado! (Digite 'sair' para terminar) 👋");

  const shutdown = () => {
    try {
      rl.close();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    while (true) {
      const userInput = await rl.question("Fala meu cumpade: ");

      if (userInput.toLowerCase() === "sair") {
        console.log("Até mais! 😊");
        shutdown();
        break;
      }

      try {
        // Objeto que contém a entrada do usuário
        const inputs = { input: userInput };

        // 1. CHAMA O MODELO PELA PRIMEIRA VEZ
        let response = await chain.invoke(inputs);
        
        // 2. VERIFICA SE O MODELO QUER CHAMAR UMA FUNÇÃO (TOOL)
        if (response.tool_calls && response.tool_calls.length > 0) {
          
          console.log("\n*** Gema solicitou uma Chamada de Função... ***");
          
          const toolOutputs = [];

          // Itera sobre as chamadas de função solicitadas pelo modelo
          for (const call of response.tool_calls) {
            const toolToRun = tools.find((tool) => tool.name === call.name);
            
            if (toolToRun) {
              // Executa a função localmente
              const output = await toolToRun.call(call.args);
              
              // Adiciona o resultado da função para enviar de volta ao modelo
              toolOutputs.push({
                tool: call.name,
                toolCallId: call.id,
                output: output,
              });
            }
          }
          
          // 3. PASSA O RESULTADO DA FUNÇÃO DE VOLTA PARA O MODELO
          // Isso é feito como uma mensagem especial (FunctionMessage)
          const secondResponse = await model.invoke(toolOutputs, {
            // Passa a mensagem original do modelo + as saídas das tools
            messages: [
              ...(await memory.loadMemoryVariables({})).chat_history, 
              response, // A mensagem da Gema solicitando a tool
              ...toolOutputs, // As saídas das tools
            ],
          });
          
          // A resposta final é a segunda resposta do modelo (que usa o resultado da tool)
          response = secondResponse;
          console.log("*** Resposta final baseada na Tool recebida. ***\n");
        }

        // SALVA AS INTERAÇÕES NA MEMÓRIA
        // A LangChain memory armazena a entrada do usuário e a resposta final do modelo
        await memory.saveContext(inputs, {
            output: response.text,
        });

        // IMPRIME A RESPOSTA FINAL
        console.log(`Gema: ${response.text}`);
        
      } catch (err) {
        console.error("Falha ao gerar resposta:", err?.message ?? err);
      }
    }
  } finally {
    shutdown();
  }
}