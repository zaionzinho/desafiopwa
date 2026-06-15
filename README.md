# ResumeAI 🤖

> Resumos inteligentes com IA em segundos — PWA mobile-first

**Desafio II + III — Porto Digital Software & AI Residency 2026**

---

## ✨ Funcionalidades

- **4 estilos de resumo**: Conciso, Detalhado, Tópicos, Acadêmico
- **🎙️ Hardware — Microfone**: Dite o texto usando a Web Speech API (`pt-BR`)
- **📷 Hardware — Câmera**: Capture texto de documentos físicos com visão computacional
- **📱 PWA**: Instalável, funciona offline (assets em cache via Service Worker)
- **📤 Compartilhamento**: Web Share API nativa no mobile
- **💾 Histórico**: Últimos 10 resumos salvos em localStorage
- **♿ Acessibilidade**: ARIA labels, foco visível, reduced motion

---

## 🚀 Deploy (Netlify)

### Configurar a chave da API

1. Crie uma conta em [OpenRouter](https://openrouter.ai/)
2. Gere uma API key
3. No Netlify → Site settings → Environment variables:
   ```
   OPENROUTER_API_KEY = sk-or-...
   ```
4. Use uma Netlify Function para proxy da API (não expor a key no frontend)

### Deploy direto

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir .
```

Ou arraste a pasta para [app.netlify.com/drop](https://app.netlify.com/drop)

---

## ⚠️ Segurança da API Key

Para produção, **nunca** exponha a API key no frontend. Use uma Netlify Function:

```js
// netlify/functions/summarize.js
exports.handler = async (event) => {
  const { text, style } = JSON.parse(event.body);
  // chama OpenRouter com process.env.OPENROUTER_API_KEY
};
```

---

## 🏗️ Arquitetura

```
resumeai/
├── index.html       # App shell
├── style.css        # Design system (Space Dark + Electric Violet)
├── app.js           # Lógica: API, hardware, histórico, PWA
├── sw.js            # Service Worker (cache-first)
├── manifest.json    # Web App Manifest
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## 📊 Lighthouse targets

| Métrica       | Target |
|---------------|--------|
| Performance   | ≥ 90   |
| Accessibility | ≥ 95   |
| Best Practices| ≥ 95   |
| SEO           | ≥ 95   |
| PWA           | ✅      |

---

## 🛠️ Stack

- **Modelo**: LLaMA 3.3 70B via OpenRouter
- **Visão** (câmera): LLaMA 3.2 11B Vision
- **Voz**: Web Speech API nativa
- **PWA**: Service Worker + Web App Manifest
- **Design**: Space Grotesk + Space Mono, dark theme
