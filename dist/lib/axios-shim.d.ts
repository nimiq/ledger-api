export default function axiosShim({ url, method, headers, data, }: {
    url: string;
    method?: 'POST' | 'GET';
    headers?: {
        [header: string]: string;
    };
    data?: string;
}): Promise<Response>;
