#pragma once

#include <memory>

namespace httplib {
class Server;
}

namespace dualgaze::http {

class Server {
public:
    Server();
    ~Server();

    Server(const Server&) = delete;
    Server& operator=(const Server&) = delete;

    bool listen(const char* host, int port);
    void stop();

private:
    std::unique_ptr<httplib::Server> svr_;
};

} // namespace dualgaze::http
