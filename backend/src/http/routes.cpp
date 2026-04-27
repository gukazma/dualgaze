#include "routes.h"

#include <httplib.h>

#include <filesystem>
#include <string>

namespace dualgaze::http {

namespace {

// datas/ 在仓库根。相对路径取决于 cwd：
//   dev: cwd 通常为仓库根 → "datas"
//   生产: 桌面 sidecar 启动时 cwd 一般为 exe 同级 → "../datas" 或同级 "datas"
// 这里依次探测，挂载第一个存在的目录；都没有时仍挂 "datas"，由 httplib 在请求时回 404。
std::string resolve_datas_dir() {
    namespace fs = std::filesystem;
    if (fs::is_directory("datas")) return "datas";
    if (fs::is_directory("../datas")) return "../datas";
    return "datas";
}

} // namespace

void register_routes(httplib::Server& svr) {
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(
            R"({"status":"ok","service":"dualgaze"})",
            "application/json; charset=utf-8");
    });

    const std::string datas = resolve_datas_dir();
    svr.set_mount_point("/datas", datas);

    // 给 3dtiles 常见后缀补默认 MIME
    svr.set_file_extension_and_mimetype_mapping("b3dm", "application/octet-stream");
    svr.set_file_extension_and_mimetype_mapping("i3dm", "application/octet-stream");
    svr.set_file_extension_and_mimetype_mapping("pnts", "application/octet-stream");
    svr.set_file_extension_and_mimetype_mapping("cmpt", "application/octet-stream");
    svr.set_file_extension_and_mimetype_mapping("glb", "model/gltf-binary");
}

} // namespace dualgaze::http
