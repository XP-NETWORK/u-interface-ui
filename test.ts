import axios from "axios"


const doReq = async ({ tokenInAddress, tokenInChainId, tokenOutAddress, tokenOutChainId, amount }:any) => {

    const query = `?tokenInAddress=${tokenInAddress}&tokenInChainId=${tokenInChainId}&tokenOutAddress=${tokenOutAddress}&tokenOutChainId=${tokenOutChainId}&amount=${amount}&type=exactIn`
    console.log({query: query.slice(1)})
    return await axios.get(`https://uhabu1zv35.execute-api.us-east-1.amazonaws.com/prod/quote${query}`)
}
const main = async () => {
    // const data = (await doReq({
    //     tokenInAddress: "0x814e97D66cc653C98b82e366220b4981fA7e260f",
    //     tokenInChainId: 97,
    //     tokenOutAddress: "0x17a1140bFeA18311bB4269b2C629D376C623efeb",
    //     tokenOutChainId: 97,
    //     amount: 1000000000000000000
    // })).data

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