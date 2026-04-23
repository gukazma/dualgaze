#include <httplib.h>

#include <iostream>

int main() {
    const char* host = "127.0.0.1";
    const int port = 8080;

    httplib::Server server;

    server.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(R"({"status":"ok"})", "application/json");
    });

    server.Get("/api/ping", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(R"({"message":"pong from DualGaze"})", "application/json");
    });

    std::cout << "DualGaze backend listening on http://" << host << ":" << port << std::endl;
    server.listen(host, port);
    return 0;
}
