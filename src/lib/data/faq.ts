export interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export const faqData: FAQItem[] = [
  {
    question: "What is Voi?",
    answer: "Voi is a Layer-1 blockchain network and Smart Contract platform designed to provide fast, secure, and scalable transactions. It aims to solve common blockchain issues such as high fees and slow transaction times, by offering:\n\n- An average block time of approximately 2.8 seconds\n- The resiliency of the AVM (Algorand Virtual Machine)",
    category: "General"
  },
  {
    question: "What is the **Voi Staking Program**?",
    answer: "The Voi Staking Program is a key initiative designed to incentivize early participation and long-term commitment to the Voi network. It offers two main ways to earn rewards:\n\n1. Locking up tokens: By locking VOI tokens in a special contract, you can earn bonus rewards through an airdrop. The bonus depends on when you stake (earlier weeks offer higher rewards) and how long you lock up (longer periods provide higher bonus rates).\n\n2. Staking for network security: By staking your locked and bonus tokens on a node, you contribute to network security and earn block rewards.\n\nKey features include:\n- Exclusive access through partner exchanges\n- Incentivized early lockup with decreasing weekly bonuses\n- Flexible lockup durations (1-18 months)\n- Weekly cap of 50 million tokens with an overflow mechanism\n- Immediate bonus and block rewards\n\nThe program starts on September 30th, with exchange listings beginning on September 26th. For detailed information and participation instructions, refer to the official Voi communications and website.",
    category: "Staking"
  },
  {
    question: "How do I create a Voi wallet?",
    answer: "There are multiple wallet options available, including:\n\n- [Kibisis](https://kibis.is/) (browser extension)\n- [Lute](https://lute.io/) (webapp and extension, with Ledger support)\n- [Biatec Wallet](https://wallet.biatec.io/) (webapp)\n\nFor more information, visit the [official Voi documentation on wallets](https://docs.voi.network/ecosystem/wallets/).",
    category: "Wallets"
  },
  {
    question: "What does it mean to **Stake** my Voi?",
    answer: "Staking in Voi refers to the process of delegating your VOI tokens to support the network's operations. By staking, the tokens in your account will contribute toward voting for the inclusion of new blocks. The proposer of each block will be rewarded for each block that is proposed.\n\nFor additional information about running a Node and staking, please refer to the [How to Node](/how_to_node) section of this website.",
    category: "Staking"
  },
  {
    question: "What does it mean to **Lock** my Voi?",
    answer: "Locking in Voi refers to the process of locking up your VOI tokens in a Smart Contract until a specified date and vesting period. By Locking tokens, you will earn an up-front bonus on the locked tokens, and the full future value of your tokens may be used to Stake on the network and earn block rewards. For additional information on the Voi Staking Program, please refer to the [Voi Foundation Medium Article](https://medium.com/@voifoundation/vois-staking-program-140mm-voi-4cbfd3a27f63) on the Voi Staking Program.",
    category: "Staking"
  },
];