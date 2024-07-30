/* eslint-disable @typescript-eslint/no-explicit-any */
import { error } from '@sveltejs/kit';
import algosdk from 'algosdk';

const algod = new algosdk.Algodv2("", "https://testnet-api.voi.nodly.io", "443");

const fetchBallast = async() => {
    const blacklistEndpoint = 'https://analytics.testnet.voi.nodly.io/v0/consensus/ballast';

    const response = await fetch(blacklistEndpoint);
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const jsonData = await response.json();
    const combinedAddresses = [
        ...Object.keys(jsonData.bparts),
    ].map(account => ({ account }));

    return combinedAddresses;
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    const urlParams = url.searchParams;
    console.log(process.version);

    const lookback_param = (urlParams.has('lookback')) ? urlParams.get('lookback') : null;
    const lookback_blocks = (lookback_param) ? parseInt(lookback_param) : 5;

    const end_block = (await algod.status().do())['last-round'];

    let ballast: Array<string> = [];

    // get ballast wallets
    try {
        ballast = (await fetchBallast()).map(account => account.account);
    }
    catch(err: any) {
        throw error(500,`Error retrieving ballast wallets from API: ${err.message}`);
    }
    
    // initialize an empty array to hold the addresses that voted
    let voted_ballast: Array<string> = [];

    // loop over the last five blocks
    for (let i = end_block - lookback_blocks; i <= end_block; i++) {
        // use algosdk to get a list of wallets that voted on each block
        const block = await algod.block(i).do();
        const voted = block["cert"]["vote"];

        // add the addresses that voted on this block to the voted_ballast array
        voted_ballast = voted_ballast.concat(voted.map((rec: any) => {
            return algosdk.encodeAddress(rec["snd"]);
        }));
    }

    // remove duplicates from the voted_ballast array
    voted_ballast = [...new Set(voted_ballast)];

    // get a list of items in ballast that are not in voted_ballast
    const diff = ballast.filter((x: any) => !voted_ballast.includes(x));

    return new Response(JSON.stringify(diff), {
        headers: {
          'Content-Type': 'application/json'
        }
    });
}