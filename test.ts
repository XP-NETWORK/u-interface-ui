import axios from "axios"


const doReq = async ({ tokenInAddress, tokenInChainId, tokenOutAddress, tokenOutChainId, amount }:any) => {
    return await axios.get(`https://uhabu1zv35.execute-api.us-east-1.amazonaws.com/prod/quote?tokenInAddress=${tokenInAddress}&tokenInChainId=${tokenInChainId}&tokenOutAddress=${tokenOutAddress}&tokenOutChainId=${tokenOutChainId}&amount=${amount}&type=exactIn`)
}
const main = async () => {
    // const data = await doReq({
    //     tokenInAddress: "0xc84a1aeb001565Ea249fF521704612aC73cF7a09",
    //     tokenInChainId: 97,
    //     tokenOutAddress: "0x49dF31a568bec15AFEE978578Eec893Ac9a19b68",
    //     tokenOutChainId: 97,
    //     amount: 100
    // })

    const data = (await doReq({
        tokenInAddress: "0xDb2a42f40158B1Cb29703e2a95a6fa3094294f05",
        tokenInChainId: 80001,
        tokenOutAddress: "0xC6402f8Ddd5427A114376c50926a17fb55498093",
        tokenOutChainId: 80001,
        amount: 1000000000000000000
    })).data
    console.log({data: JSON.stringify(data)})
}


main()