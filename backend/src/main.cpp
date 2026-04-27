#include "http/server.h"

#include <atomic>
#include <csignal>
#include <iostream>

namespace {

std::atomic<dualgaze::http::Server*> g_running_server{nullptr};

void on_signal(int /*sig*/) {
    if (auto* s = g_running_server.load(); s != nullptr) {
        s->stop();
    }
}

void install_signal_handlers() {
    std::signal(SIGINT, on_signal);
    std::signal(SIGTERM, on_signal);
}

} // namespace

int main() {
    constexpr const char* kHost = "127.0.0.1";
    constexpr int kPort = 8080;

    dualgaze::http::Server server;
    g_running_server.store(&server);
    install_signal_handlers();

    std::cout << "[dualgaze] listening on http://" << kHost << ":" << kPort << std::endl;
    const bool ok = server.listen(kHost, kPort);
    g_running_server.store(nullptr);
    return ok ? 0 : 1;
}
