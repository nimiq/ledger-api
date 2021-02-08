// For avoiding bundling the unnecessary axios dependency in @ledgerhq/hw-transport-http, we use fetch instead and
// shim the required api parts of axios.

export default function axiosShim({
    url,
    method,
    headers,
    data,
}: {
    url: string,
    method?: 'POST' | 'GET',
    headers?: { [header: string]: string },
    data?: string,
}): Promise<Response> {
    return fetch(url, {
        method,
        headers,
        body: data,
    });
}
