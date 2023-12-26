import { createApi, fetchBaseQuery, FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import { Protocol } from '@uniswap/router-sdk'
import { sendAnalyticsEvent } from 'analytics'
import { isUniswapXSupportedChain } from 'constants/chains'
import ms from 'ms'
import { logSwapQuoteRequest } from 'tracing/swapFlowLoggers'
import { trace } from 'tracing/trace'

import {
  GetQuoteArgs,
  INTERNAL_ROUTER_PREFERENCE_PRICE,
  QuoteMethod,
  QuoteState,
  RouterPreference,
  RoutingConfig,
  TradeResult,
  URAQuoteResponse,
  URAQuoteType,
} from './types'
import { isExactInput, transformQuoteToTrade } from './utils'

const UNISWAP_API_URL = process.env.REACT_APP_UNISWAP_API_URL
if (UNISWAP_API_URL === undefined) {
  throw new Error(`UNISWAP_API_URL must be a defined environment variable`)
}

const CLIENT_PARAMS = {
  protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
}

const protocols: Protocol[] = [Protocol.V2, Protocol.V3, Protocol.MIXED]

// routing API quote query params: https://github.com/Uniswap/routing-api/blob/main/lib/handlers/quote/schema/quote-schema.ts
const DEFAULT_QUERY_PARAMS = {
  protocols,
  // this should be removed once BE fixes issue where enableUniversalRouter is required for fees to work
  enableUniversalRouter: true,
}

function getQuoteLatencyMeasure(mark: PerformanceMark): PerformanceMeasure {
  performance.mark('quote-fetch-end')
  return performance.measure('quote-fetch-latency', mark.name, 'quote-fetch-end')
}

function getRoutingAPIConfig(args: GetQuoteArgs): RoutingConfig {
  const { account, tokenInChainId, uniswapXForceSyntheticQuotes, routerPreference } = args

  const uniswapx = {
    useSyntheticQuotes: uniswapXForceSyntheticQuotes,
    // Protocol supports swap+send to different destination address, but
    // for now recipient === swapper
    recipient: account,
    swapper: account,
    routingType: URAQuoteType.DUTCH_LIMIT,
  }

  const classic = {
    ...DEFAULT_QUERY_PARAMS,
    routingType: URAQuoteType.CLASSIC,
    recipient: account,
    enableFeeOnTransferFeeFetching: true,
  }

  if (
    // If the user has opted out of UniswapX during the opt-out transition period, we should respect that preference and only request classic quotes.
    routerPreference === RouterPreference.API ||
    routerPreference === INTERNAL_ROUTER_PREFERENCE_PRICE ||
    !isUniswapXSupportedChain(tokenInChainId)
  ) {
    return [classic]
  }

  return [uniswapx, classic]
}

export const routingApi = createApi({
  reducerPath: 'routingApi',
  baseQuery: fetchBaseQuery({
    baseUrl: UNISWAP_API_URL,
  }),
  endpoints: (build) => ({
    getQuote: build.query<TradeResult, GetQuoteArgs>({
      async onQueryStarted(args: GetQuoteArgs, { queryFulfilled }) {
        trace(
          'quote',
          async ({ setTraceError, setTraceStatus }) => {
            try {
              await queryFulfilled
            } catch (error: unknown) {
              if (error && typeof error === 'object' && 'error' in error) {
                const queryError = (error as Record<'error', FetchBaseQueryError>).error
                if (typeof queryError.status === 'number') {
                  setTraceStatus(queryError.status)
                }
                setTraceError(queryError)
              } else {
                throw error
              }
            }
          },
          {
            data: {
              ...args,
              isPrice: args.routerPreference === INTERNAL_ROUTER_PREFERENCE_PRICE,
              isAutoRouter: args.routerPreference === RouterPreference.API,
            },
          }
        )
      },
      async queryFn(args, _api, _extraOptions, fetch) {
        logSwapQuoteRequest(args.tokenInChainId, args.routerPreference, false)
        const quoteStartMark = performance.mark(`quote-fetch-start-${Date.now()}`)
        try {
          const {
            tokenInAddress: tokenIn,
            tokenInChainId,
            tokenOutAddress: tokenOut,
            tokenOutChainId,
            amount,
            tradeType,
            sendPortionEnabled,
          } = args

          const requestBody = {
            tokenInChainId,
            tokenIn,
            tokenOutChainId,
            tokenOut,
            amount,
            sendPortionEnabled,
            type: isExactInput(tradeType) ? 'EXACT_INPUT' : 'EXACT_OUTPUT',
            intent: args.routerPreference === INTERNAL_ROUTER_PREFERENCE_PRICE ? 'pricing' : undefined,
            configs: getRoutingAPIConfig(args),
          }

           // const response = await fetch({
          //   method: 'POST',
          //   url: `${baseURL}/quote`,
          //   body: JSON.stringify(requestBody),
          //   headers: {
          //     'x-request-source': 'uniswap-web',
          //   },
          // })

          const rs = {
            "routing": "CLASSIC",
            "quote": {
              "methodParameters": {
                "calldata": "0x24856bc3000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000010000000000000000000000000067081bd856e29d7d7b3028c34afb331fa6b3186e0000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000051fd90f6d670ee3700000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002bdb2a42f40158b1cb29703e2a95a6fa3094294f050001f4c6402f8ddd5427a114376c50926a17fb55498093000000000000000000000000000000000000000000",
                "value": "0x00",
                "to": "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD"
              },
              "blockNumber": "43826765",
              "amount": "1000000000000000000",
              "amountDecimals": "1",
              "quote": "5937577864394108776",
              "quoteDecimals": "5.937577864394108776",
              "quoteGasAdjusted": "5937577864394108776",
              "quoteGasAdjustedDecimals": "5.937577864394108776",
              "gasUseEstimateQuote": "0",
              "gasUseEstimateQuoteDecimals": "0",
              "gasUseEstimate": "128000",
              "gasUseEstimateUSD": "0",
              "simulationStatus": "UNATTEMPTED",
              "simulationError": false,
              "gasPriceWei": "2947928410",
              "route": [
                [
                  {
                    "type": "v3-pool",
                    "address": "0x6dD98E2175F5f2c7D78F2f3C99B2AbaF00a15683",
                    "tokenIn": {
                      "chainId": 97,
                      "decimals": "18",
                      "address": "0x814e97D66cc653C98b82e366220b4981fA7e260f",
                      "symbol": "USDT"
                    },
                    "tokenOut": {
                      "chainId": 97,
                      "decimals": "18",
                      "address": "0x17a1140bFeA18311bB4269b2C629D376C623efeb",
                      "symbol": "USDC"
                    },
                    "fee": "500",
                    "liquidity": "4624415554576876951",
                    "sqrtRatioX96": "25052894984021797146183221489",
                    "tickCurrent": "-23028",
                    "amountIn": "1000000000000",
                    "amountOut": "1000000"
                  }
                ]
              ],
              "routeString": "[V3] 100.00% = USDT -- 0.05% [0x6dD98E2175F5f2c7D78F2f3C99B2AbaF00a15683] --> USDC",
              "quoteId": "810cf411-14f8-4bc1-a6ed-c6dd0f783a90",
              "hitsCachedRoutes": true,
              "portionBips": 0,
              "portionAmount": "0",
              "portionAmountDecimals": "0",
              "quoteGasAndPortionAdjusted": "5937577864394108776",
              "quoteGasAndPortionAdjustedDecimals": "5.937577864394108776",
              "requestId": "ecf99a2b-f7dc-4170-9a2c-519426374b3b",
              "tradeType": "EXACT_INPUT",
              "slippage": 0.5
            },
            "requestId": "ecf99a2b-f7dc-4170-9a2c-519426374b3b",
            "allQuotes": [
              {
                "routing": "CLASSIC",
                "quote": {
                  "methodParameters": {
                    "calldata": "0x24856bc3000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000010000000000000000000000000067081bd856e29d7d7b3028c34afb331fa6b3186e0000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000051fd90f6d670ee3700000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002bdb2a42f40158b1cb29703e2a95a6fa3094294f050001f4c6402f8ddd5427a114376c50926a17fb55498093000000000000000000000000000000000000000000",
                    "value": "0x00",
                    "to": "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD"
                  },
                  "blockNumber": "43826765",
                  "amount": "1000000000000000000",
                  "amountDecimals": "1",
                  "quote": "5937577864394108776",
                  "quoteDecimals": "5.937577864394108776",
                  "quoteGasAdjusted": "5937577864394108776",
                  "quoteGasAdjustedDecimals": "5.937577864394108776",
                  "gasUseEstimateQuote": "0",
                  "gasUseEstimateQuoteDecimals": "0",
                  "gasUseEstimate": "128000",
                  "gasUseEstimateUSD": "0",
                  "simulationStatus": "UNATTEMPTED",
                  "simulationError": false,
                  "gasPriceWei": "2947928410",
                  "route": [
                    [
                      {
                        "type": "v3-pool",
                        "address": "0x6dD98E2175F5f2c7D78F2f3C99B2AbaF00a15683",
                        "tokenIn": {
                          "chainId": 97,
                          "decimals": "18",
                          "address": "0x814e97D66cc653C98b82e366220b4981fA7e260f",
                          "symbol": "USDT"
                        },
                        "tokenOut": {
                          "chainId": 97,
                          "decimals": "18",
                          "address": "0x17a1140bFeA18311bB4269b2C629D376C623efeb",
                          "symbol": "USDC"
                        },
                        "fee": "500",
                        "liquidity": "4624415554576876951",
                        "sqrtRatioX96": "25052894984021797146183221489",
                        "tickCurrent": "-23028",
                        "amountIn": "1000000000000000000",
                        "amountOut": "5937577864394108776"
                      }
                    ]
                  ],
                  "routeString": "[V3] 100.00% = USDT -- 0.05% [0x6dD98E2175F5f2c7D78F2f3C99B2AbaF00a15683] --> USDC",
                  "quoteId": "810cf411-14f8-4bc1-a6ed-c6dd0f783a90",
                  "hitsCachedRoutes": true,
                  "portionBips": 0,
                  "portionAmount": "0",
                  "portionAmountDecimals": "0",
                  "quoteGasAndPortionAdjusted": "5937577864394108776",
                  "quoteGasAndPortionAdjustedDecimals": "5.937577864394108776",
                  "requestId": "ecf99a2b-f7dc-4170-9a2c-519426374b3b",
                  "tradeType": "EXACT_INPUT",
                  "slippage": 0.5
                }
              }
            ]
          }
          
          const response: { error: any, data: any } = {
            error: undefined,
            data: rs
          }
          console.log({ response })

          if (response.error) {
            try {
              // cast as any here because we do a runtime check on it being an object before indexing into .errorCode
              const errorData = response.error.data as { errorCode?: string; detail?: string }
              // NO_ROUTE should be treated as a valid response to prevent retries.
              if (
                typeof errorData === 'object' &&
                (errorData?.errorCode === 'NO_ROUTE' || errorData?.detail === 'No quotes available')
              ) {
                sendAnalyticsEvent('No quote received from routing API', {
                  requestBody,
                  response,
                  routerPreference: args.routerPreference,
                })
                return {
                  data: { state: QuoteState.NOT_FOUND, latencyMs: getQuoteLatencyMeasure(quoteStartMark).duration },
                }
              }
            } catch {
              throw response.error
            }
          }

          const uraQuoteResponse = response.data as URAQuoteResponse
          const tradeResult = await transformQuoteToTrade(args, uraQuoteResponse, QuoteMethod.ROUTING_API)
          return { data: { ...tradeResult, latencyMs: getQuoteLatencyMeasure(quoteStartMark).duration } }
        } catch (error: any) {
          console.warn(
            `GetQuote failed on Unified Routing API, falling back to client: ${error?.message ?? error?.detail ?? error
            }`
          )
        }

        try {
          const { getRouter, getClientSideQuote } = await import('lib/hooks/routing/clientSideSmartOrderRouter')
          const router = getRouter(args.tokenInChainId)
          const quoteResult = await getClientSideQuote(args, router, CLIENT_PARAMS)
          if (quoteResult.state === QuoteState.SUCCESS) {
            const trade = await transformQuoteToTrade(args, quoteResult.data, QuoteMethod.CLIENT_SIDE_FALLBACK)
            return {
              data: { ...trade, latencyMs: getQuoteLatencyMeasure(quoteStartMark).duration },
            }
          } else {
            return { data: { ...quoteResult, latencyMs: getQuoteLatencyMeasure(quoteStartMark).duration } }
          }
        } catch (error: any) {
          console.warn(`GetQuote failed on client: ${error}`)
          return {
            error: { status: 'CUSTOM_ERROR', error: error?.detail ?? error?.message ?? error },
          }
        }
      },
      keepUnusedDataFor: ms(`10s`),
      extraOptions: {
        maxRetries: 0,
      },
    }),
  }),
})

export const { useGetQuoteQuery } = routingApi
export const useGetQuoteQueryState = routingApi.endpoints.getQuote.useQueryState
