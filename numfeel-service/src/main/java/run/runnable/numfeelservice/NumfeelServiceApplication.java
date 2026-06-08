package run.runnable.numfeelservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class NumfeelServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(NumfeelServiceApplication.class, args);
	}

}
