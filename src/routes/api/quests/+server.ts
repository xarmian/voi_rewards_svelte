/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    console.log(url);
    const urlParams = url.searchParams;

    const project = urlParams.get('project');
    const wallet = urlParams.get('wallet');

    if (!project || !wallet) {
        return new Response(JSON.stringify({error: 'Missing required parameters'}), {
            headers: {
              'Content-Type': 'application/json'
            }
        });
    }

    if (project === 'Algoleagues') {
        try {
            const url = `https://4wjjj4w7u5.execute-api.us-east-1.amazonaws.com/default/addr/${wallet}`;
            const response = await fetch(url);
            const jsonData = await response.json();

            if (!jsonData.error) {
                return new Response(JSON.stringify(jsonData), {
                    headers: {
                      'Content-Type': 'application/json'
                    }
                });
            }

        } catch (error) {
            console.error('Failed to fetch points:', error);
        }
    }

    return new Response(JSON.stringify({error: 'Invalid project'}), {
        headers: {
          'Content-Type': 'application/json'
        }
    });

}