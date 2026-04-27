#pragma once

namespace httplib {
class Server;
}

namespace dualgaze::http {

void register_routes(httplib::Server& svr);

} // namespace dualgaze::http
