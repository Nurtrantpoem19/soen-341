(function (root) {
    function createApplicationApi(environment) {
        return async function request(path, options = {}) {
            const token = environment.sessionStorage.getItem('careerconnect_token');
            if (!token) throw Object.assign(new Error('Please log in to access your applications.'), { status: 401 });
            let response;
            try {
                response = await environment.fetch(`http://localhost:3000/api/applications${path}`, {
                    ...options,
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
                });
            } catch {
                throw new Error('Unable to connect to the server. Please try again.');
            }
            if (response.status === 401) {
                environment.sessionStorage.removeItem('careerconnect_token');
                throw Object.assign(new Error('Your session has expired. Please log in again.'), { status: 401 });
            }
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(data.message || 'Unable to load applications. Please try again.'), { status: response.status });
            return data;
        };
    }
    if (typeof module === 'object' && module.exports) module.exports = { createApplicationApi };
    else root.applicationRequest = createApplicationApi(root);
})(globalThis);
