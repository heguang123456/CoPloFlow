// 测试用 C++ 代码：覆盖各类语法元素
#include <iostream>
#include <vector>
#include <string>

// 常量定义
const int MAX_SIZE = 100;
constexpr double PI = 3.14159265;

// 枚举
enum class Color {
    Red,
    Green,
    Blue,
};

// 命名空间
namespace utils {

// 结构体
struct Point {
    double x;
    double y;

    double distance(const Point& other) const {
        double dx = x - other.x;
        double dy = y - other.y;
        return sqrt(dx * dx + dy * dy);
    }
};

// 类定义
class Shape {
public:
    virtual ~Shape() = default;
    virtual double area() const = 0;
    virtual void draw() const;

protected:
    Color color_;
    std::string name_;
};

class Circle : public Shape {
public:
    explicit Circle(double radius)
        : radius_(radius) {
        color_ = Color::Blue;
        name_ = "Circle";
    }

    double area() const override {
        return PI * radius_ * radius_;
    }

    void draw() const override {
        std::cout << "Drawing " << name_
                  << " with radius " << radius_ << std::endl;
    }

private:
    double radius_;
};

} // namespace utils

// 函数声明
template<typename T>
T max_value(T a, T b);

// 函数定义
template<typename T>
T max_value(T a, T b) {
    return (a > b) ? a : b;
}

// 主函数
int main() {
    // 变量声明
    int count = 0;
    std::vector<utils::Circle> shapes;

    // 循环
    for (int i = 0; i < 5; ++i) {
        shapes.emplace_back(static_cast<double>(i + 1));
    }

    // 条件语句
    if (!shapes.empty()) {
        for (const auto& shape : shapes) {
            std::cout << "Area: " << shape.area() << std::endl;
            shape.draw();
        }
    }

    // 异常处理
    try {
        auto max = max_value(10, 20);
        std::cout << "Max: " << max << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }

    // 使用 nullptr 和 static_cast
    utils::Shape* ptr = nullptr;
    auto* circle = static_cast<utils::Circle*>(ptr);

    // Lambda 表达式
    auto sum = [&shapes]() {
        double total = 0.0;
        for (const auto& s : shapes) {
            total += s.area();
        }
        return total;
    };

    return 0;
}

/* 多行注释测试
 * 这是一个跨越多行的注释
 * 用于验证注释解析的完整性
 */
