# Relatório de Entrega — Landing + Webhook FastDepix → UTMify/Meta

## 1. Arquitetura

```
Facebook Ads
   ↓
Landing Page (index.html + js/main.js)
   → Pixel Meta dispara (PageView, InitiateCheckout)
   → UTMify captura UTMs (script cdn.utmify.com.br)
   → usuário escolhe valor → clica "Doar Agora"
   → redireciona para https://fastdepix.space/p/P0A33B0B9/sos
      preservando: utm_*, fbclid, fbc, fbp, ref (UUID gerado no navegador)
   ↓
Checkout hospedado pela FastDepix (nome, CPF/CNPJ, telefone, PIX, QR Code — tudo lá)
   ↓
Webhook FastDepix → POST /api/webhook (Vercel)
   → loga headers + query + body completos
   → procura identificadores conhecidos (utm_*, fbc, fbp, ref, external_id, etc.)
   → monta pedido e envia para UTMify (POST /api-credentials/orders)
   → se houver fbc/fbp no payload, envia Purchase para a Meta Conversion API
```

A landing **não guarda estado de visitantes em banco de dados**. A
correlação entre "quem visitou" e "quem pagou" depende inteiramente de a
FastDepix devolver, no webhook, os parâmetros que enviamos na URL do
checkout (`ref`, `utm_*`, `fbc`, `fbp`). Isso ainda não foi confirmado —
ver seção 4.

## 2. Arquivos alterados

- `index.html` — sem mudanças nesta rodada (já estava sem checkout próprio).
- `js/main.js` — reescrito: gera `ref` (UUID) por sessão, lê `_fbc`/`_fbp`
  dos cookies do Pixel, lê `fbclid` e as UTMs estendidas da URL de
  entrada, monta a URL do checkout da FastDepix com todos esses
  parâmetros e redireciona.
- `package.json` — voltou a ter função serverless (`api/webhook.js`),
  mantido `engines.node >= 18` (necessário pro `fetch` nativo).

## 3. Arquivos criados

- `api/webhook.js` — recebe o webhook da FastDepix, loga tudo, extrai
  identificadores, envia para UTMify e (condicionalmente) para a Meta CAPI.
- `lib/identifiers.js` — varredura recursiva do payload por campos conhecidos.
- `lib/utmify.js` — client HTTP para `POST https://api.utmify.com.br/api-credentials/orders`.
- `lib/meta-capi.js` — client HTTP para a Meta Conversion API (`/events`), com hashing SHA-256 dos dados pessoais.
- `.env.example` — variáveis de ambiente necessárias (ver seção 5).

## 4. Limitações encontradas na documentação da FastDepix

A documentação pública da FastDepix **não especifica**:

- o formato exato do payload do webhook (nomes de campo para evento,
  valor, id da transação, dados do comprador);
- se ela repassa parâmetros da URL do checkout hospedado (UTMs, fbc,
  fbp, ref) de volta no webhook, e sob qual chave;
- se há assinatura/segredo para validar a autenticidade do webhook.

Por isso `api/webhook.js` foi construído em modo "descoberta": ele
aceita qualquer payload, loga tudo (`console.log` de headers, query e
body — visível em Vercel → Deployments → Functions → Logs), e faz
parsing best-effort com nomes de campo alternativos (`amount`,
`amount_cents`, `priceInCents`, `value`; `event`, `type`, `event_type`
etc.), marcados com `// TODO` no código.

**Ação necessária de sua parte:** gerar uma transação real (ou de
teste, se a FastDepix suportar) e me enviar (ou colar aqui) o conteúdo
bruto dos logs da function `webhook` na Vercel. A partir disso eu ajusto
os `TODO`s para o schema real, em vez de adivinhar.

## 5. Variáveis de ambiente necessárias na Vercel

| Variável | Onde obter |
|---|---|
| `UTMIFY_API_TOKEN` | UTMify → Integrações → Webhooks → Credenciais de API |
| `META_PIXEL_ID` | Gerenciador de Eventos do Meta (já é `856184800629236`, usado no `index.html`) |
| `META_ACCESS_TOKEN` | Gerenciador de Eventos → Configurações → Conversion API → Gerar token |
| `META_TEST_EVENT_CODE` | opcional, só para testar em "Test Events" |

## 6. Parâmetros preservados no redirecionamento

Confirmado no código (`js/main.js`): `utm_source`, `utm_campaign`,
`utm_medium`, `utm_content`, `utm_term`, `utm_id`,
`utm_source_platform`, `utm_creative_format`, `utm_marketing_tactic`,
`fbclid`, `fbc`, `fbp`, `ref`.

**Não confirmado:** se a FastDepix realmente lê/usa/repassa esses
parâmetros — a doc dela não fala nada a respeito. Só saberemos
testando (seção 4).

## 7. Quais dados chegaram no webhook / quais não chegaram

Ainda **não testado nesta sessão** — não tenho acesso ao seu ambiente
FastDepix/Vercel em produção para gerar uma transação real. Assim que
você rodar um teste e me passar os logs, atualizo esta seção com o
resultado real (o que a FastDepix manda vs. o que não manda).

## 8. UTMify — mapeamento de status

| Evento FastDepix (esperado) | Status enviado à UTMify |
|---|---|
| `transaction.created` | `waiting_payment` (Pendente) |
| `transaction.approved` / `transaction.paid` | `paid` (Paga) |
| `transaction.refunded` | `refunded` (Reembolsada) |

Esses nomes de evento vieram da sua especificação — ainda não
confirmados contra o payload real da FastDepix.

## 9. Meta Conversion API — regra de envio

Só envia `Purchase` quando o webhook chega com `status = paid` **e**
`fbc` ou `fbp` presentes entre os identificadores extraídos do payload.
Sem isso, fica só logado como "não enviado" — para não inventar
correlação entre venda e visitante.
