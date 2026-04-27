#include "server.h"
#include "routes.h"

#include <httplib.h>

namespace dualgaze::http {

Server::Server() : svr_(std::make_unique<httplib::Server>()) {
    register_routes(*svr_);
}

Server::~Server() = default;

bool Server::listen(const char* host, int port) {
    return svr_->listen(host, port);
}

void Server::stop() {
    svr_->stop();
}

} // namespace dualgaze::http
