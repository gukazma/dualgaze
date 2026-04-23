cmake_minimum_required(VERSION 3.20)
project(dualgaze_backend LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.15.3
)
FetchContent_MakeAvailable(httplib)

add_executable(dualgaze_server src/main.cpp)
target_link_libraries(dualgaze_server PRIVATE httplib::httplib)

if(WIN32)
    target_compile_definitions(dualgaze_server PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()
